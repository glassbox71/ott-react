import { create } from "zustand";
import { auth, db } from "../firebase/firebase";
import { useAuthStore } from "./useAuthStore";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export const useHeartStore = create((set, get) => ({
    // 찜리스트를 저장할 배열
    hearts: [],
    // 찜리스트를 배열에 저장할 메서드
    onAddHearts: async (item) => {
        const user = auth.currentUser;
        if (!user) return;
        const currentMember = useAuthStore.getState().currentMember;
        if (!currentMember) return;
        try {
            const heartItem = {
                id: item.id,
                // item안에 title 항목이 있는지 체크해서 있으면 title을 사용하고 없으면 name을 사용하고
                //movie는 제목을 title키로 가지고, tv는 제목을 name키로 가진다
                title: "title" in item ? item.title : item.name,
                poster_path: item.poster_path
            }
            // firebase 에 저장하기
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                // 이전에 저장된 자료를 가져와서
                const prevHeart =
                    userDoc.data()?.familyMembers?.[currentMember]?.likes || []
                // 내가 찜한 항목이라 일치하는 않는것만 추가로 넣기
                const filtered = prevHeart.filter((h) => h.id !== item.id)
                //추가로 넣기
                const newHeart = [heartItem, ...filtered]
                // firebase 자료를 업데이트하기
                await updateDoc(userDocRef, { [`familyMembers.${currentMember}.likes`]: newHeart })
                // zustand 변수에도 자료 업데이트
                set({ hearts: newHeart })
                console.log(get().hearts)
            }

        } catch (err) {
            console.log("찜오류", err.message)
        }
    },
    // 저장된 찜리스트 불러오기
    onLoadHearts: async () => {
        const user = auth.currentUser;
        if (!user) return;
        const currentMember = useAuthStore.getState().currentMember;
        if (!currentMember) return;
        try {
            //firebase 사용자계정
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const likes = userDoc.data()?.familyMembers?.[currentMember]?.likes || []
                set({ hearts: likes })
            }
        }
        catch (err) {
            console.log("찜리스트 불러오기 오류", err)
        }
    },
    // 토글
    // 하트 토글 메서드 추가
    onToggleHearts: async (item) => {
        // 현재 찜한 콘텐츠인지 확인
        const hearted = get().onIsHeart(item.id);
        if (hearted) {
            // 찜한 상태라면 삭제
            await get().onRemoveHearts(item.id);
        } else {
            // 찜하지 않은 상태라면 추가
            await get().onAddHearts(item);
        }
    },
    // 삭제
    onRemoveHearts: async (id) => {
        const user = auth.currentUser;
        if (!user) return;
        const currentMember = useAuthStore.getState().currentMember;
        if (!currentMember) return;
        try {
            //firebase 사용자계정
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                //firebase
                const likes = userDoc.data()?.familyMembers?.[currentMember]?.likes || []
                const filtered = likes.filter((h) => h.id !== id);

                await updateDoc(userDocRef, { [`familyMembers.${currentMember}.likes`]: filtered })
                set({ hearts: filtered })
                alert("찜삭제");
            }

        } catch (err) {
            console.log("찜삭제 오류", err)
        }
    },
    //   하트 체크 해줄 메서드
    onIsHeart: (id) => {
        console.log("선택아이디", id)
        // some 데이터가 배열의 객체로 있는지를 체크해서 true/false를 반환한다
        return get().hearts.some((h) => h.id === id)
    }
}))
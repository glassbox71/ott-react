import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { googleLoginConfigured } from '../firebase/firebase';

export const Login = () => {
  const navigate = useNavigate();
  const { onGoogleLogin, isLoggingIn, loginError, loginErrorCode } = useAuthStore();
  const visibleError = loginError || (!googleLoginConfigured ? '구글 로그인 서비스 설정이 누락되었습니다. 운영자가 Firebase 환경 설정을 확인해야 합니다.' : '');
  const handleGoogleLogin = async () => {
    const user = await onGoogleLogin();
    if (user) navigate('/selectMember');
  };
  return <section className="sub-page pt-60 px-6 pb-20"><div className="inner max-w-xl">
    <h2 className="section-title text-3xl font-bold mb-5">로그인</h2>
    <p className="mb-5">구글 계정으로 회원 프로필과 찜 목록을 이용하세요.</p>
    {visibleError && <p className="mb-4 text-red-700" role="alert">{visibleError}</p>}
    {loginErrorCode && <p className="mb-4 text-sm text-slate-600">오류 코드: {loginErrorCode}</p>}
    <button className="border rounded-lg p-4 disabled:opacity-50" onClick={handleGoogleLogin} disabled={isLoggingIn}>{isLoggingIn ? '구글 로그인 연결 중…' : '구글 로그인'}</button>
    <p className="mt-6">로그인 없이도 스포츠 채팅을 이용할 수 있습니다. <Link to="/sports" className="underline">게스트로 스포츠 보기 →</Link></p>
  </div></section>;
};

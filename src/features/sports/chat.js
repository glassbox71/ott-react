// Only expose known SDK codes; Firebase error messages can contain request details.
export function chatFailure(failure, operation) {
  const code = String(failure?.code || '').replace(/^firestore\//, '');
  const reasons = {
    'permission-denied': 'Firestore 보안 규칙이 요청을 거부했습니다. 운영 프로젝트의 sportsRooms 규칙을 확인해 주세요.',
    unauthenticated: '게스트 인증이 만료됐습니다. 게스트로 다시 연결해 주세요.',
    unavailable: '서버에 연결할 수 없습니다. 네트워크 연결을 확인해 주세요.',
    'resource-exhausted': 'Firestore 사용 한도를 초과했습니다. 프로젝트 할당량을 확인해 주세요.',
    'failed-precondition': 'Firestore 데이터베이스 또는 색인 설정을 확인해 주세요.',
    'not-found': 'Firestore 데이터베이스와 연결 프로젝트를 확인해 주세요.',
    'deadline-exceeded': '서버 응답이 지연되고 있습니다. 네트워크 연결을 확인해 주세요.',
  };
  return `${operation}: ${reasons[code] || '채팅 서비스 연결을 확인하고 다시 시도해 주세요.'}${reasons[code] ? ` (${code})` : ''}`;
}

export function visibleMessages(messages, outbox) {
  const byId = new Map(messages.map(message => [message.id, message]));
  // Keep failed/pending drafts visible even after Firestore rolls back a rejected write.
  for (const message of outbox) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAtMs - b.createdAtMs);
}

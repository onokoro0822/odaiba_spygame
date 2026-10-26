// 答えの写真などは直接は開けない。関数の中から env.ASSETS で読むだけにする
export const onRequest = () => new Response('Not found', { status: 404 });

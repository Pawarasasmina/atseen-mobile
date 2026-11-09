declare module 'socket.io-client/dist/socket.io.js' {
  import type { Socket } from 'socket.io-client';

  const socketIo: {
    (uri: string, opts?: Record<string, unknown>): Socket;
    io: (uri: string, opts?: Record<string, unknown>) => Socket;
  };

  export type { Socket };
  export default socketIo;
}

import { io } from "socket.io-client";

const configuredServerUrl = import.meta.env.VITE_SERVER_URL;
const SERVER_URL =
  import.meta.env.PROD && configuredServerUrl?.includes("localhost")
    ? window.location.origin
    : configuredServerUrl || window.location.origin;

let socket = null;

export function connectSocket(token) {
  if (socket) socket.disconnect();
  socket = io(SERVER_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

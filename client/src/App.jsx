import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, missingConfig } from "./firebase";
import { connectSocket, disconnectSocket } from "./socket";
import { apiFetch } from "./utils";
import AuthScreen from "./components/AuthScreen";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";

const PALETTE = ["#6C5CE7", "#00B894", "#0984E3", "#E17055", "#E84393", "#00CEC9", "#FDCB6E"];
function colorFor(uid) {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
}

export default function App() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = loading
  const [token, setToken] = useState(null);
  const [me, setMe] = useState(null);
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [onlineUids, setOnlineUids] = useState(new Set());
  const [active, setActive] = useState(null); // { chatId, peer }
  const [showChatMobile, setShowChatMobile] = useState(false);

  // --- auth lifecycle ---
  useEffect(() => {
    if (!auth) {
      setAuthUser(null);
      return undefined;
    }

    return onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) {
        setToken(null);
        setMe(null);
        disconnectSocket();
        setSocket(null);
        return;
      }
      const idToken = await user.getIdToken();
      setToken(idToken);
      const profile = await apiFetch("/api/users/sync", {
        token: idToken,
        method: "POST",
        body: { displayName: user.displayName, photoColor: colorFor(user.uid) },
      });
      setMe(profile);
    });
  }, []);

  // --- socket lifecycle ---
  useEffect(() => {
    if (!token) return;
    const s = connectSocket(token);
    setSocket(s);
    s.on("presence:update", ({ uid, online }) => {
      setOnlineUids((prev) => {
        const next = new Set(prev);
        online ? next.add(uid) : next.delete(uid);
        return next;
      });
    });
    s.on("chat:updated", ({ chatId, lastMessage, senderId }) => {
      setChats((prev) => {
        const idx = prev.findIndex((c) => c.chatId === chatId);
        if (idx === -1) return prev;
        const updated = {
          ...prev[idx],
          lastMessage: { text: lastMessage, senderId },
          updatedAt: { _seconds: Math.floor(Date.now() / 1000) },
        };
        const rest = prev.filter((c) => c.chatId !== chatId);
        return [updated, ...rest];
      });
    });
    return () => s.disconnect();
  }, [token]);

  // --- initial data load ---
  const loadData = useCallback(async () => {
    if (!token) return;
    const [u, c] = await Promise.all([
      apiFetch("/api/users", { token }),
      apiFetch("/api/chats", { token }),
    ]);
    setUsers(u);
    setChats(c);
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function openChat(chatId, peer) {
    setActive({ chatId, peer });
    setShowChatMobile(true);
  }

  async function startChat(peer) {
    const { chatId } = await apiFetch("/api/chats", {
      token,
      method: "POST",
      body: { peerId: peer.uid },
    });
    setChats((prev) => {
      if (prev.some((c) => c.chatId === chatId)) return prev;
      return [{ chatId, peer, lastMessage: null, updatedAt: null }, ...prev];
    });
    openChat(chatId, peer);
  }

  function handleLogout() {
    signOut(auth);
  }

  if (authUser === undefined) {
    return <div className="center-loading" style={{ height: "100vh" }}>Загрузка…</div>;
  }

  if (!authUser || !me) {
    return <AuthScreen configError={missingConfig.length > 0} />;
  }

  return (
    <div className={`app-shell ${showChatMobile ? "show-chat" : ""}`}>
      <Sidebar
        me={me}
        chats={chats}
        users={users}
        onlineUids={onlineUids}
        activeChatId={active?.chatId}
        onOpenChat={openChat}
        onStartChat={startChat}
        onLogout={handleLogout}
      />
      {active ? (
        <ChatWindow
          key={active.chatId}
          chatId={active.chatId}
          peer={active.peer}
          me={me}
          token={token}
          socket={socket}
          isPeerOnline={onlineUids.has(active.peer.uid)}
          onBack={() => setShowChatMobile(false)}
        />
      ) : (
        <div className="chat-panel">
          <div className="chat-empty">
            <div className="chat-empty-inner">
              <div className="chat-empty-glyph" />
              <p>Выберите чат слева или начните новый на вкладке «Люди».</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

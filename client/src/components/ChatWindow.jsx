import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import { apiFetch, formatLastSeen } from "../utils";

export default function ChatWindow({ chatId, peer, me, token, socket, isPeerOnline, onBack }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const scrollRef = useRef(null);
  const typingTimeout = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    apiFetch(`/api/chats/${chatId}/messages`, { token })
      .then((data) => {
        if (!cancelled) setMessages(data);
      })
      .finally(() => !cancelled && setLoading(false));

    socket?.emit("chat:join", chatId);
    return () => {
      cancelled = true;
      socket?.emit("chat:leave", chatId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    if (!socket) return;
    function onNew(msg) {
      if (msg.chatId === chatId) {
        setMessages((prev) => [...prev, msg]);
      }
    }
    function onTyping({ chatId: cId, uid, isTyping }) {
      if (cId === chatId && uid === peer.uid) setPeerTyping(isTyping);
    }
    socket.on("message:new", onNew);
    socket.on("typing", onTyping);
    return () => {
      socket.off("message:new", onNew);
      socket.off("typing", onTyping);
    };
  }, [socket, chatId, peer.uid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, peerTyping]);

  function handleChange(e) {
    setDraft(e.target.value);
    socket?.emit("typing", { chatId, isTyping: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket?.emit("typing", { chatId, isTyping: false });
    }, 1200);
  }

  function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !socket) return;
    socket.emit("message:send", { chatId, text });
    setDraft("");
    socket.emit("typing", { chatId, isTyping: false });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSend(e);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack}>
          ←
        </button>
        <Avatar name={peer.displayName} color={peer.photoColor} size={38} online={isPeerOnline} />
        <div>
          <div className="chat-header-name">{peer.displayName}</div>
          <div className="chat-header-status">{peer.type === "group"
            ? `${peer.members?.length || 0} участников`
            : peerTyping ? "печатает…" : isPeerOnline ? "в сети" : formatLastSeen(peer.lastSeen?._seconds)}</div>
        </div>
      </div>

      <div className="messages-scroll" ref={scrollRef}>
        {loading ? (
          <div className="center-loading">Загрузка сообщений…</div>
        ) : messages.length === 0 ? (
          <div className="empty-hint">Сообщений пока нет. Напишите первым!</div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              text={m.text}
              time={m.createdAt?._seconds}
              isOwn={m.senderId === me.uid}
              senderName={m.senderName}
              showSender={peer.type === "group" && m.senderId !== me.uid}
            />
          ))
        )}
      </div>

      <div className="typing-indicator">{peerTyping ? `${peer.displayName} печатает…` : ""}</div>

      <form className="composer" onSubmit={handleSend}>
        <textarea
          rows={1}
          placeholder="Написать сообщение…"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <button className="send-btn" type="submit" disabled={!draft.trim()}>
          ➤
        </button>
      </form>
    </div>
  );
}

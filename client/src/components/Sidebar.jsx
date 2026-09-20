import { useMemo, useState } from "react";
import Avatar from "./Avatar";
import { formatLastSeen } from "../utils";

export default function Sidebar({
  me,
  chats,
  users,
  onlineUids,
  activeChatId,
  onOpenChat,
  onStartChat,
  onStartGroup,
  onLogout,
}) {
  const [tab, setTab] = useState("chats"); // "chats" | "people"
  const [query, setQuery] = useState("");
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupError, setGroupError] = useState("");

  const filteredChats = useMemo(() => {
    if (!query.trim()) return chats;
    return chats.filter((c) =>
      c.peer.displayName.toLowerCase().includes(query.toLowerCase())
    );
  }, [chats, query]);

  const filteredUsers = useMemo(() => {
    if (!query.trim()) return users;
    return users.filter((u) =>
      u.displayName.toLowerCase().includes(query.toLowerCase())
    );
  }, [users, query]);

  async function handleCreateGroup(event) {
    event.preventDefault();
    setGroupError("");
    try {
      await onStartGroup(groupName, selectedIds);
      setGroupName("");
      setSelectedIds([]);
      setShowGroupForm(false);
    } catch (error) {
      setGroupError(error.message);
    }
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="brand-mark" style={{ marginBottom: 0 }}>
          <div className="brand-glyph" style={{ width: 34, height: 34, fontSize: 15, borderRadius: 10 }}>
            N
          </div>
          <div className="brand-name" style={{ fontSize: 18 }}>Nexa</div>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          placeholder={tab === "chats" ? "Поиск в переписках" : "Найти человека"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === "chats" ? "active" : ""}`}
          onClick={() => setTab("chats")}
        >
          Чаты
        </button>
        <button
          className={`sidebar-tab ${tab === "people" ? "active" : ""}`}
          onClick={() => setTab("people")}
        >
          Люди
        </button>
        <button className="sidebar-tab group-tab" onClick={() => setShowGroupForm(true)} title="Создать группу">
          + Группа
        </button>
      </div>

      {showGroupForm && (
        <form className="group-form" onSubmit={handleCreateGroup}>
          <input
            placeholder="Название группы"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            required
          />
          <div className="group-members">
            {users.map((user) => (
              <label key={user.uid}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(user.uid)}
                  onChange={() => setSelectedIds((ids) => ids.includes(user.uid)
                    ? ids.filter((id) => id !== user.uid)
                    : [...ids, user.uid])}
                />
                {user.displayName}
              </label>
            ))}
          </div>
          {groupError && <div className="auth-error">{groupError}</div>}
          <div className="group-form-actions">
            <button type="button" onClick={() => setShowGroupForm(false)}>Отмена</button>
            <button className="btn-primary" type="submit">Создать</button>
          </div>
        </form>
      )}

      <div className="sidebar-list">
        {tab === "chats" &&
          (filteredChats.length === 0 ? (
            <div className="empty-hint">
              Пока нет переписок.
              <br />
              Перейдите на вкладку «Люди», чтобы начать первый чат.
            </div>
          ) : (
            filteredChats.map((c) => (
              <div
                key={c.chatId}
                className={`list-row ${c.chatId === activeChatId ? "active" : ""}`}
                onClick={() => onOpenChat(c.chatId, c.peer)}
                role="button"
                tabIndex={0}
              >
                <Avatar
                  name={c.peer.displayName}
                  color={c.peer.photoColor}
                  online={onlineUids.has(c.peer.uid)}
                />
                <div className="list-row-body">
                  <div className="list-row-top">
                    <span className="list-row-name">{c.peer.displayName}</span>
                    <span className="list-row-time">
                      {c.updatedAt?._seconds
                        ? new Date(c.updatedAt._seconds * 1000).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                  <div className="list-row-sub">
                    {c.lastMessage
                      ? `${c.lastMessage.senderId === me.uid ? "Вы: " : ""}${c.lastMessage.text}`
                      : "Нет сообщений"}
                  </div>
                </div>
              </div>
            ))
          ))}

        {tab === "people" &&
          (filteredUsers.length === 0 ? (
            <div className="empty-hint">Пользователи не найдены.</div>
          ) : (
            filteredUsers.map((u) => (
              <div
                key={u.uid}
                className="list-row"
                onClick={() => onStartChat(u)}
                role="button"
                tabIndex={0}
              >
                <Avatar name={u.displayName} color={u.photoColor} online={onlineUids.has(u.uid)} />
                <div className="list-row-body">
                  <div className="list-row-top">
                    <span className="list-row-name">{u.displayName}</span>
                  </div>
                  <div className="list-row-sub">
                    {onlineUids.has(u.uid) ? "в сети" : formatLastSeen(u.lastSeen?._seconds)}
                  </div>
                </div>
              </div>
            ))
          ))}
      </div>

      <div className="sidebar-footer">
        <Avatar name={me.displayName} color={me.photoColor} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar-footer-name">{me.displayName}</div>
        </div>
        <button className="icon-btn" title="Выйти" onClick={onLogout}>
          ⎋
        </button>
      </div>
    </div>
  );
}

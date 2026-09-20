import { formatTime } from "../utils";

export default function MessageBubble({ text, time, isOwn, senderName, showSender }) {
  return (
    <div className={`msg-row ${isOwn ? "out" : "in"}`}>
      <div className={`bubble ${isOwn ? "out" : "in"}`}>
        {showSender && <div className="bubble-sender">{senderName}</div>}
        {text}
        <div className="bubble-time">{formatTime(time)}</div>
      </div>
    </div>
  );
}

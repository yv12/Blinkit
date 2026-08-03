export default function EndCard({ message }) {
  return (
    <div className="end-card">
      <h2>That's a wrap</h2>
      <p>{message || "That's it for today — come back tomorrow."}</p>
    </div>
  );
}

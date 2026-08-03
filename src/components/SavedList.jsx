import NudgeBanner from "./NudgeBanner.jsx";

export default function SavedList({
  state,
  onOpenDiscover,
  nudge,
  onOpenNudge,
  onDismissNudge,
}) {
  const saved = state?.saved_list || [];

  return (
    <div className="screen saved-screen">
      <header className="screen-head">
        <h1>Saved</h1>
        <p>Right-swipes wait here for the right moment</p>
      </header>

      {nudge ? (
        <NudgeBanner match={nudge} onOpen={onOpenNudge} onDismiss={onDismissNudge} />
      ) : null}

      <div className="list-stack">
        {saved.length === 0 ? (
          <div className="empty-state">
            Nothing saved yet.
            <button type="button" className="text-link" onClick={onOpenDiscover}>
              Open Discover
            </button>
          </div>
        ) : (
          saved
            .slice()
            .reverse()
            .map((item) => (
              <article key={item.product_id} className="list-row">
                <img src={item.image_url} alt="" />
                <div className="list-row-body">
                  <strong>{item.name}</strong>
                  <span>₹{Math.round(item.price)}</span>
                  {item.bio ? <em>“{item.bio}”</em> : null}
                </div>
              </article>
            ))
        )}
      </div>
    </div>
  );
}

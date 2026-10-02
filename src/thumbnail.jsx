import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Preview } from "./Preview";
import "./styles.css";
function Worker() {
  const [job, setJob] = useState(null);
  useEffect(() => window.thumbnailWorker.onJob(setJob), []);
  const send = (data) =>
    window.thumbnailWorker.result(job.token, data).catch(() => {});
  return job ? (
    <div style={{ width: 360, height: 300 }}>
      <Preview
        key={job.token}
        file={job.file}
        thumbnail
        onReady={(image, facts) => send({ image, facts })}
        onError={(error) => send({ error })}
      />
    </div>
  ) : null;
}
createRoot(document.getElementById("root")).render(<Worker />);

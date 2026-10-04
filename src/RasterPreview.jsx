import React, { useState } from "react";
export const hasRasterPreview = (file) =>
  ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(file?.ext) &&
  file.size <= 8 * 1024 ** 2;
export function RasterPreview({ file }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="raster-preview">
      {failed ? (
        <p>
          Image preview unavailable. The file is still listed and can be copied.
        </p>
      ) : (
        <img
          src={`scout://app/image/${file.id}?v=${encodeURIComponent(file.version)}`}
          alt={"Image preview of " + file.name}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

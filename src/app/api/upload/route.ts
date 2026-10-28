import { statefulRoute } from "@/server/http";
import { uploadFileDirect, deleteFile } from "@/server/upload";

/**
 * PUT    /api/upload — upload an image; the server generates the storage key.
 * DELETE /api/upload — delete one of *your* uploads.
 *
 * Both are state-changing browser calls, so they go through `statefulRoute`:
 * origin-checked (CSRF) and error-wrapped. Session + key-ownership checks live
 * in src/server/upload.ts.
 */
export const PUT = statefulRoute(
  async function PUT(request: Request) {
    return uploadFileDirect(request);
  },
  { route: "PUT /api/upload" },
);

export const DELETE = statefulRoute(
  async function DELETE(request: Request) {
    return deleteFile(request);
  },
  { route: "DELETE /api/upload" },
);

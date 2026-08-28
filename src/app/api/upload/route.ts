import { uploadFileDirect, deleteFile } from "@/server/upload";

export async function PUT(request: Request) {
  return uploadFileDirect(request);
}

export async function DELETE(request: Request) {
  return deleteFile(request);
}
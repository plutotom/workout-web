export class RequestBodyTooLargeError extends Error {}

/** Read and parse JSON without buffering more than the configured byte limit. */
export async function parseBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase();
  if (!contentType?.startsWith("application/json")) {
    throw new SyntaxError("Expected application/json");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError("Request body is too large");
  }
  if (!request.body) throw new SyntaxError("Missing request body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError("Request body is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

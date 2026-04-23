export async function compressCommands(input: string): Promise<Blob> {
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  writer.write(new TextEncoder().encode(input)).then(() => writer.close())
  return new Response(cs.readable).blob()
}

export async function decompressBlob(blob: Blob): Promise<string> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  writer.write(await blob.arrayBuffer()).then(() => writer.close())
  return new Response(ds.readable).text()
}

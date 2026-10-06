/** Mocked file payload. Nothing touches the disk or the `objects.content` column. */
export interface MockFile {
  name: string;
  content: string;
  size: number;
  updatedAt: string;
}

/**
 * In-memory stand-in for real file storage, used by the example FileController.
 * Only the kernel side (matrix and entity lifecycle) is real; the data here is fake and lost on restart.
 */
export class FileRepository {
  private readonly files = new Map<string, MockFile>();

  /** Files created outside this API (e.g. via /commands) get generated placeholder content. */
  find(name: string): MockFile {
    return this.files.get(name) ?? this.store(name, `Mock content of ${name}`);
  }

  create(name: string, content: string): MockFile {
    return this.store(name, content);
  }

  update(name: string, content: string): MockFile {
    return this.store(name, content);
  }

  delete(name: string): void {
    this.files.delete(name);
  }

  private store(name: string, content: string): MockFile {
    const file = { name, content, size: Buffer.byteLength(content), updatedAt: new Date().toISOString() };
    this.files.set(name, file);
    return file;
  }
}

declare module 'archiver' {
    import { Transform } from 'stream';
    interface AppendOptions {
        name?: string;
    }
    interface Archiver extends Transform {
        append(source: Buffer | NodeJS.ReadableStream | string, options?: AppendOptions): this;
        finalize(): Promise<void>;
        pipe<T extends NodeJS.WritableStream>(destination: T): T;
        on(event: 'error', listener: (err: Error) => void): this;
    }
    function archiver(format: string, options?: {
        zlib?: {
            level?: number;
        };
    }): Archiver;
    export = archiver;
}

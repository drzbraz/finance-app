/** A bank statement PDF received from the client. */
export interface UploadedStatement {
  fileName: string;
  data: Buffer;
}

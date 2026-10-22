/** An .xlsx received from the client. */
export interface UploadedSpreadsheet {
  fileName: string;
  data: Buffer;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

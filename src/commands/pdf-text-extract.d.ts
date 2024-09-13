declare module '@vestfoldfylke/pdf-text-extract' {
  function pdfTextExtract(path: string): {
    metadata: {
      info: {
        PDFFormatVersion: string,
        Language:string,
        EncryptFilterName:string,
        IsLinearized: boolean,
        IsAcroFormPresent: boolean,
        IsXFAPresent: boolean,
        IsCollectionPresent: boolean,
        IsSignaturesPresent: boolean,
        Producer: string,
        CreationDate: string,
        ModDate: string,
      },
      metadata: any | null
      contentDispositionFilename: string | null,
      contentLength: number | null,
      numPages: number
    },
    pages: {
      pageNumber: number,
      textLines: string[],
      textItems: {
        str:string,
        dir: string,
        width: number,
        height: number,
        transform: number[],
        fontName: string,
        hasEOL: boolean
      }[]
    }[],
    styles: {
      fontName: string
      fontFamily: string
      ascent: number
      descent: number
      vertical: boolean
    }[]
  }
}

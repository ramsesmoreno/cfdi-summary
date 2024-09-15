import type { Arguments, CommandBuilder } from 'yargs'
import fs from 'fs'
import * as cheerio from 'cheerio'
import { pdfTextExtract } from '@vestfoldfylke/pdf-text-extract'

type Options = object
type Invoice = {
  version?: string
  uuid?: string,
  date?: string,
  emitterTaxId?: string
  emitterName?: string
  receiverTaxId?: string
  receiverName?: string,
  amount?: number,
  iva?: number,
  isrRetention?: number,
  ivaRetention?: number,
  total?: number,
  filename?: string,
  type?: string,
  currency?: string
}

const mapType = (type: string | undefined) => {
  switch (type) {
    case 'I':
      return 'Ingreso'
    case 'E':
      return 'Egreso'
    case 'P':
      return 'Pago'
    default:
      return 'Desconocido'
  }
}

export const command = '* [d]'
export const description = 'Buscar archivos XMLs que sean CFDIs y contabilizar su contenido'
export const builder: CommandBuilder<Options, Options> = yargs =>
  yargs
    .option('d', {
      alias: 'dir',
      type: 'string',
      demandOption: false,
      describe: 'Directorio en donde buscar archivos CFDI',
      default: '.'
    })
    .option('r', {
      alias: 'renombrar',
      type: 'boolean',
      demandOption: false,
      describe: 'Renombra el archivo con el formato YYY-MM-DD_UUID',
      default: false
    })
    .option('p', {
      alias: 'prefijo',
      type: 'string',
      demandOption: false,
      describe: 'Si se renombra, agregar este prefijo',
      default: ''
    })
    .option('s', {
      alias: 'sufijo',
      type: 'string',
      demandOption: false,
      describe: 'Si se renombra, agregar este sufijo',
      default: ''
    })
    .option('a', {
      alias: 'agrupar',
      type: 'string',
      demandOption: false,
      describe: 'Agrupar las facturas en directorios diferentes, si se proporciona un RFC, la primer separación se hará en emitidas y recibidas, la segunda separación por tipos: ingresos, egresos, pagos... en diferentes directorios. Solo funciona en combinación con --rename / -r'
    })

export const handler = async (argv: Arguments<Options>): Promise<void>  => {
  const dir = argv.dir as string
  const rename = argv.renombrar as string
  const folderName = String(dir).split('/').at(-1) || '.'
  process.stdout.write(`Buscando en el directorio '${folderName}'... `)
  const xmls = fs.readdirSync(dir as string).filter(f => f.split('.').at(-1) === 'xml')
  process.stdout.write(`${xmls.length} xmls encontrados.\n`)
  const invoices: Invoice[] = []
  const cheerioOptions = {
    xml: true,
    quirksMode: true,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
  }
  const pdfMap = new Map()
  if (rename) {
    // Scan for pdfs and try to read the Folio Fiscal to have it handy
    const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
    const pdfs = fs.readdirSync(dir as string).filter(f => f.split('.').at(-1) === 'pdf')
    // First check filenames
    for (let pdf in pdfs) {
      const filenameMatch = pdf.match(uuidRegex)
      if (filenameMatch !== null) {
        pdfMap.set(filenameMatch[0], pdfs[pdf])
      }
    }
    // The file contents
    for (let pdf in pdfs) {
      const pdfData = await pdfTextExtract(`${dir}/${pdfs[pdf]}`)
      for (let p = 0; p < pdfData.pages?.length || 0; p++) {
        const textLines = pdfData.pages[p].textLines
        for (let l = 0; l < pdfData.pages[p].textLines.length; l++) {
          const line = pdfData.pages[p].textLines[l]
          const contentMatch = line.match(uuidRegex)
          if (contentMatch !== null && !pdfMap.has(contentMatch[0])) {
            pdfMap.set(contentMatch[0], pdfs[pdf])
          }
        }
      }
    }
    if (argv.agrupar !== undefined) {
      if (argv.agrupar !== '') {
        if (!fs.existsSync(`${dir}/recibidas`)) fs.mkdirSync(`${dir}/recibidas`)
        if (!fs.existsSync(`${dir}/recibidas/ingresos`)) fs.mkdirSync(`${dir}/recibidas/ingresos`)
        if (!fs.existsSync(`${dir}/recibidas/egresos`)) fs.mkdirSync(`${dir}/recibidas/egresos`)
        if (!fs.existsSync(`${dir}/recibidas/complementos`)) fs.mkdirSync(`${dir}/recibidas/complementos`)
        if (!fs.existsSync(`${dir}/emitidas`)) fs.mkdirSync(`${dir}/emitidas`)
        if (!fs.existsSync(`${dir}/emitidas/ingresos`)) fs.mkdirSync(`${dir}/emitidas/ingresos`)
        if (!fs.existsSync(`${dir}/emitidas/egresos`)) fs.mkdirSync(`${dir}/emitidas/egresos`)
        if (!fs.existsSync(`${dir}/emitidas/complementos`)) fs.mkdirSync(`${dir}/emitidas/complementos`)
      } else {
        if (!fs.existsSync(`${dir}/ingresos`)) fs.mkdirSync(`${dir}/ingresos`)
        if (!fs.existsSync(`${dir}/egresos`)) fs.mkdirSync(`${dir}/egresos`)
        if (!fs.existsSync(`${dir}/complementos`)) fs.mkdirSync(`${dir}/complementos`)
      }
    }
  }
  xmls.forEach(fileName => {
    process.stdout.write(` - ${fileName}\n`)
    const filePath = `${dir}/${fileName}`
    const fileContent = fs.readFileSync(filePath).toString()
    const fileObject = cheerio.load(fileContent, cheerioOptions)
    const invoice: Invoice = {
      amount: 0,
      iva: 0,
      isrRetention: 0,
      ivaRetention: 0,
    }
    const schema = fileObject('cfdi\\:Comprobante').attr('xsi:schemalocation')
    if (!schema?.startsWith('http://www.sat.gob.mx/cfd')) return
    invoice.uuid = fileObject('tfd\\:TimbreFiscalDigital').attr('uuid')
    invoice.version = fileObject('cfdi\\:Comprobante').attr('version')
    invoice.date = fileObject('cfdi\\:Comprobante').attr('fecha')
    invoice.emitterTaxId = fileObject('cfdi\\:Emisor').attr('rfc')
    invoice.emitterName = fileObject('cfdi\\:Emisor').attr('nombre')
    invoice.receiverTaxId = fileObject('cfdi\\:Receptor').attr('rfc')
    invoice.receiverName = fileObject('cfdi\\:Receptor').attr('nombre')
    invoice.total = Number(fileObject('cfdi\\:Comprobante').attr('total'))
    invoice.type = mapType(fileObject('cfdi\\:Comprobante').attr('tipodecomprobante'))
    invoice.currency = fileObject('cfdi\\:Comprobante').attr('moneda')

    const conceptos = fileObject('cfdi\\:Conceptos cfdi\\:Concepto')
    conceptos.each(index => {
      invoice.amount! += Number(conceptos[index].attribs.importe)
    })

    const taxes = fileObject('cfdi\\:Comprobante > cfdi\\:Impuestos > cfdi\\:Traslados > cfdi\\:Traslado')
    taxes.each(index => {
      if (taxes[index].attribs.impuesto === '002' || taxes[index].attribs.impuesto === 'IVA') {
        invoice.iva! += Number(taxes[index].attribs.importe || 0)
      }
    })

    const retentions = fileObject('cfdi\\:Comprobante > cfdi\\:Impuestos > cfdi\\:Retenciones cfdi\\:Retencion')
    retentions.each(index => {
      if (retentions[index].attribs.impuesto === 'IVA' || retentions[index].attribs.impuesto === '002') {
        invoice.ivaRetention! += Number(retentions[index].attribs.importe || 0)
      }
      if (retentions[index].attribs.impuesto === 'ISR' || retentions[index].attribs.impuesto === '001') {
        invoice.isrRetention! += Number(retentions[index].attribs.importe || 0)
      }
    })
    if (rename) {
      let newDir = dir
      if (argv.agrupar !== undefined) {
        if (argv.agrupar !== '') {
          newDir += String(invoice.emitterTaxId).toUpperCase() === String(argv.agrupar).toUpperCase() ? '/emitidas' : (String(invoice.receiverTaxId).toUpperCase() === String(argv.agrupar).toUpperCase() ? '/recibidas' : '')
        }
        newDir += invoice.type === 'Ingreso' ? '/ingresos' : (invoice.type === 'Egreso' ? '/egresos' : '/complementos')
      }
      const newName = `${invoice.date?.split('T').at(0)}_${invoice.uuid}`
      const baseName = fileName.split('.xml').at(0)
      fs.renameSync(`${dir}/${baseName}.xml`, `${newDir}/${argv.prefijo}${newName}${argv.sufijo}.xml`)
      // Check if a related PDF exists, first by filename
      if (fs.existsSync(`${dir}/${baseName}.pdf`)) {
        fs.renameSync(`${dir}/${baseName}.pdf`, `${newDir}/${argv.prefijo}${newName}${argv.sufijo}.pdf`)
      } else if (pdfMap.has(invoice.uuid) && fs.existsSync(`${dir}/${pdfMap.get(invoice.uuid)}`)) {
        fs.renameSync(`${dir}/${pdfMap.get(invoice.uuid)}`, `${newDir}/${argv.prefijo}${newName}${argv.sufijo}.pdf`)
      }
      process.stdout.write(`   - renombrado como: ${argv.prefijo}${newName}${argv.sufijo}\n`)
      invoice.filename = `${argv.prefijo}${newName}${argv.sufijo}\n`
    } else {
      invoice.filename = fileName
    }
    process.stdout.write(`   - uuid:     ${invoice.uuid}\n`)
    process.stdout.write(`   - fecha:    ${invoice.date}\n`)
    process.stdout.write(`   - version:  ${invoice.version}\n`)
    process.stdout.write(`   - emisor:   ${invoice.emitterName}\n`)
    process.stdout.write(`   - receptor: ${invoice.receiverName}\n`)
    process.stdout.write(`   - importe:  ${invoice.amount}\n`)
    process.stdout.write(`   - tipo:     ${invoice.type}\n`)
    invoices.push(invoice)
  })
  invoices.sort((i1, i2) => (i1.date || '') < (i2.date || '') ? -1 : 1)
  let amountTotal = 0
  let ivaTotal = 0
  let ivaRetentionTotal = 0
  let isrRetentionTotal=0
  let total = 0
  let csv = 'archivo,fecha,uuid,version,rfc_emisor,emisor,rfc_receptor,receptor,tipo,moneda,subtotal,iva,retencion_iva,retencion_isr,total\n'
  invoices.forEach(invoice => {
    csv += `"${invoice.filename}","${invoice.date}","${invoice.uuid}","${invoice.version}","${invoice.emitterTaxId}","${invoice.emitterName}","${invoice.receiverTaxId}","${invoice.receiverName}","${invoice.type}","${invoice.currency}","${invoice.amount?.toFixed(2)}","${invoice.iva?.toFixed(2)}","${invoice.ivaRetention?.toFixed(2)}","${invoice.isrRetention?.toFixed(2)}","${invoice.total?.toFixed(2)}"\n`
    if (invoice.type === 'Ingreso') {
      amountTotal +=  invoice.amount ?? 0
      ivaTotal += invoice.iva ?? 0
      ivaRetentionTotal += invoice.ivaRetention ?? 0
      isrRetentionTotal += invoice.isrRetention ?? 0
      total += invoice.total ?? 0
    }
  })
  csv += `"","","","","","","","","","","${amountTotal.toFixed(2)}","${ivaTotal.toFixed(2)}","${ivaRetentionTotal.toFixed(2)}","${isrRetentionTotal?.toFixed(2)}","${total?.toFixed(2)}"\n`
  fs.writeFileSync(`${dir}/${dir.split('/').at(-1)}.csv`, csv)

  process.stdout.write(`Listo.\n`)
}
import type { Arguments, CommandBuilder } from 'yargs'
import fs from 'fs'
import * as cheerio from 'cheerio'

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
  total?: number
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

export const handler = (argv: Arguments<Options>): void  => {
  const dir = argv.dir as string
  const folderName = String(dir).split('/').at(-1) || '.'
  process.stdout.write(`Buscando en el directorio '${folderName}'... `)
  const xmls = fs.readdirSync(dir as string).filter(f => f.split('.').at(-1) === 'xml')
  process.stdout.write(`${xmls.length} xmls encontrados.\n`)
  const invoices: Invoice[] = []
  xmls.forEach(fileName => {
    process.stdout.write(` - ${fileName}\n`)
    const filePath = `${dir}/${fileName}`
    const fileContent = fs.readFileSync(filePath).toString()
    const fileObject = cheerio.load(fileContent, {
      xml: true,
      quirksMode: true,
      lowerCaseAttributeNames: true,
      lowerCaseTags: true,
    })
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

    process.stdout.write(`   - uuid: ${invoice.uuid}\n`)
    process.stdout.write(`   - fecha: ${invoice.date}\n`)
    process.stdout.write(`   - version: ${invoice.version}\n`)
    process.stdout.write(`   - emisor: ${invoice.emitterName}\n`)
    process.stdout.write(`   - receptor: ${invoice.receiverName}\n`)
    process.stdout.write(`   - importe: ${invoice.amount}\n`)
    invoices.push(invoice)
  })
  invoices.sort((i1, i2) => (i1.date || '') < (i2.date || '') ? -1 : 1)

  let csv = 'fecha,uuid,version,rfc_emisor,emisor,rfc_receptor,receptor,subtotal,iva,retencion_iva,retencion_isr,total\n'
  invoices.forEach(invoice => {
    csv += `"${invoice.date}","${invoice.uuid}","${invoice.version}","${invoice.emitterTaxId}","${invoice.emitterName}","${invoice.receiverTaxId}","${invoice.receiverName}","${invoice.amount?.toFixed(2)}","${invoice.iva?.toFixed(2)}","${invoice.ivaRetention?.toFixed(2)}","${invoice.isrRetention?.toFixed(2)}","${invoice.total?.toFixed(2)}"\n`
  })
  fs.writeFileSync(`${dir}/${dir.split('/').at(-1)}.csv`, csv)

  process.stdout.write(`Listo.\n`)
}
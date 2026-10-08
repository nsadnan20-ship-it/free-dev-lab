export const HEADER_SYNONYMS: Record<string, string> = {
  'رقم الصنف':'sku','كود الصنف':'sku','رمز الصنف':'sku','رقم المادة':'sku','item code':'sku','item no':'sku','item number':'sku','sku':'sku','barcode':'barcode','باركود':'barcode','الباركود':'barcode',
  'اسم الصنف':'product_name','الصنف':'product_name','اسم المادة':'product_name','اسم المنتج':'product_name','item name':'product_name','product name':'product_name','description':'description','الوصف':'description',
  'الوحدة':'unit','وحدة القياس':'unit','unit':'unit','الكمية':'quantity','الكمية المتوفرة':'quantity','الرصيد':'quantity','رصيد المخزون':'quantity','quantity':'quantity','stock':'quantity','balance':'quantity',
  'السعر':'price','سعر البيع':'price','سعر الوحدة':'price','unit price':'price','price':'price','التكلفة':'cost','سعر التكلفة':'cost','cost':'cost',
  'التاريخ':'date','التاريخ والوقت':'date','date':'date','رقم العميل':'customer_id','كود العميل':'customer_id','customer code':'customer_id','customer number':'customer_id','اسم العميل':'customer_name','العميل':'customer_name','customer name':'customer_name',
  'رقم المورد':'supplier_id','كود المورد':'supplier_id','supplier code':'supplier_id','supplier number':'supplier_id','اسم المورد':'supplier_name','المورد':'supplier_name','supplier name':'supplier_name',
  'رقم الفاتورة':'document_number','رقم المستند':'document_number','invoice no':'document_number','invoice number':'document_number','document number':'document_number','الاجمالي':'total','الإجمالي':'total','total':'total','الخصم':'discount','discount':'discount','الضريبة':'tax','tax':'tax','المرتجع':'returned_quantity','returned quantity':'returned_quantity'
};
export function normalizeHeader(value: unknown): string { const raw=String(value??'').trim().toLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[ً-ٟ]/g,'').replace(/[ _-]+/g,' '); return HEADER_SYNONYMS[raw]??raw.replace(/\s+/g,'_'); }
export function normalizeHeaders(headers: unknown[]): string[] { return headers.map(normalizeHeader); }

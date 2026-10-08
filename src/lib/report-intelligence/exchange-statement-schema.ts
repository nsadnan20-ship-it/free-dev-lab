export type LedgerSide='debit'|'credit';
export type StatementEntity='customer'|'cashier'|'platform'|'exchange'|'bank'|'supplier'|'other';
export interface ExchangeStatementField{field:string;aliases:string[];type:'identifier'|'name'|'date'|'datetime'|'currency'|'amount'|'ledger_side'|'balance'|'period'|'reference'|'contact'|'address'|'transaction_type'|'description';dynamic:boolean;required:boolean;}
export const EXCHANGE_STATEMENT_FIELDS:ExchangeStatementField[]=[
{field:'entityName',aliases:['اسم الصرافة','اسم الشركة','اسم المنصة','الجهة','الجهة المالية'],type:'name',dynamic:false,required:false},
{field:'entityType',aliases:['نوع الجهة','نوع الحساب'],type:'identifier',dynamic:false,required:false},
{field:'branchName',aliases:['الفرع','اسم الفرع','المركز الرئيسي'],type:'name',dynamic:false,required:false},
{field:'entityAddress',aliases:['العنوان','عنوان الفرع','العنوان الرئيسي'],type:'address',dynamic:false,required:false},
{field:'contactNumbers',aliases:['أرقام التواصل','رقم الهاتف','الهاتف','خدمة العملاء','الرقم المجاني'],type:'contact',dynamic:false,required:false},
{field:'accountName',aliases:['اسم الحساب','اسم المستفيد','صاحب الحساب'],type:'name',dynamic:true,required:false},
{field:'accountNumber',aliases:['رقم الحساب','رقم المحفظة','رقم العميل','الحساب'],type:'identifier',dynamic:true,required:false},
{field:'statementAsOf',aliases:['حتى تاريخ','تاريخ الكشف','تاريخ التقرير','حتى'],type:'datetime',dynamic:true,required:false},
{field:'periodFrom',aliases:['من تاريخ','بداية الفترة','الفترة من'],type:'date',dynamic:true,required:false},
{field:'periodTo',aliases:['إلى تاريخ','نهاية الفترة','الفترة إلى'],type:'date',dynamic:true,required:false},
{field:'currency',aliases:['العملة','نوع العملة','العملة التفصيلية'],type:'currency',dynamic:true,required:false},
{field:'transactionDate',aliases:['التاريخ','تاريخ الحركة','تاريخ العملية'],type:'date',dynamic:true,required:false},
{field:'transactionType',aliases:['نوع الحركة','نوع العملية','العملية','العمليات'],type:'transaction_type',dynamic:false,required:false},
{field:'referenceNumber',aliases:['رقم المرجع','المرجع','رقم الحركة','رقم السند','رقم العملية'],type:'reference',dynamic:true,required:false},
{field:'description',aliases:['البيان','الوصف','التفاصيل','الشرح'],type:'description',dynamic:false,required:false},
{field:'debitAmount',aliases:['مدين','المدين','المبلغ المدين','عليه','عليكم'],type:'amount',dynamic:true,required:false},
{field:'creditAmount',aliases:['دائن','الدائن','المبلغ الدائن','له','لكم'],type:'amount',dynamic:true,required:false},
{field:'balanceAmount',aliases:['الرصيد','الرصيد الحالي','الرصيد النهائي','الصافي'],type:'balance',dynamic:true,required:false},
{field:'balanceSide',aliases:['نوع الرصيد','الرصيد دائن','الرصيد مدين','له/عليه'],type:'ledger_side',dynamic:true,required:false},
{field:'openingDebit',aliases:['رصيد سابق مدين','الرصيد الافتتاحي المدين','مدين سابق'],type:'amount',dynamic:true,required:false},
{field:'openingCredit',aliases:['رصيد سابق دائن','الرصيد الافتتاحي الدائن','دائن سابق'],type:'amount',dynamic:true,required:false},
{field:'closingDebit',aliases:['الرصيد الختامي المدين','ختامي مدين'],type:'amount',dynamic:true,required:false},
{field:'closingCredit',aliases:['الرصيد الختامي الدائن','ختامي دائن'],type:'amount',dynamic:true,required:false},
{field:'transactionCount',aliases:['عدد الحركات','عدد العمليات'],type:'amount',dynamic:true,required:false},
{field:'sourceFile',aliases:['اسم الملف','مصدر التقرير'],type:'reference',dynamic:true,required:false}
];
export const DYNAMIC_STATEMENT_FIELDS=EXCHANGE_STATEMENT_FIELDS.filter(x=>x.dynamic).map(x=>x.field);
export function normalizeLedgerSide(value:string):LedgerSide|undefined{const v=value.trim().toLowerCase();if(['مدين','عليه','عليكم','debit','dr'].includes(v))return'debit';if(['دائن','له','لكم','credit','cr'].includes(v))return'credit';return undefined;}
export function isDynamicStatementField(field:string){return DYNAMIC_STATEMENT_FIELDS.includes(field);}

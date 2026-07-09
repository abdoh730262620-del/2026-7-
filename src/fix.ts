import * as fs from 'fs';

const p = 'src/pages/Customers.tsx';
let txt = fs.readFileSync(p, 'utf-8');

txt = txt.replace(/\{isPartiallyPaid && \(\s+<div className=\"text-\[10px\] font-bold text-black mt-0\.5\">\s+مدفوع: \{alreadyPaid.toLocaleString\(\)\} \| متب.*?<div className=\"flex items-center gap-2 w-full md:w-auto justify-end relative\">/s,
`{isPartiallyPaid && (
                                                            <div className="text-[10px] font-bold text-black mt-0.5">
                                                                مدفوع: {alreadyPaid.toLocaleString()} | متبقي: {invoiceRemaining.toLocaleString()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 w-full md:w-auto justify-end relative">`);

fs.writeFileSync(p, txt);

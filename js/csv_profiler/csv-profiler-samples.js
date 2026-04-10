export function createGoodCsvSampleText() {
    return [
        'order_id,customer,region,order_date,units,unit_price,fulfilled',
        '5001,Avery Stone,North,2026-01-04,12,18.50,true',
        '5002,Morgan Lee,West,2026-01-05,4,42.00,true',
        '5003,Jordan Patel,South,2026-01-06,18,9.75,false',
        '5004,Riley Chen,East,2026-01-07,7,31.20,true',
        '5005,Casey Brooks,North,2026-01-08,15,14.10,true',
        '5006,Taylor Reed,West,2026-01-09,9,22.80,false',
        '5007,Quinn Davis,South,2026-01-10,21,7.60,true',
        '5008,Jamie Morgan,East,2026-01-11,3,118.00,true',
        '5009,Drew Parker,North,2026-01-12,10,26.40,false',
        '5010,Sam Rivera,West,2026-01-13,6,35.25,true',
        '5011,Alex Kim,South,2026-01-14,14,16.90,true',
        '5012,Blair Adams,East,2026-01-15,8,44.75,false'
    ].join('\n');
}

export function createGoodCsvSampleFile() {
    const text = createGoodCsvSampleText();

    return new File([text], 'good-orders.csv', {
        type: 'text/csv'
    });
}

export function createBadCsvSampleText() {
    return [
        'customer_id,amount,amount,event_date,notes',
        '1001,42.50,paid,2026-03-01,normal row',
        '1002,57.10,paid,2026-03-02,clean comma row',
        '1003,not_a_number,paid,March 3 2026,mixed numeric type',
        '1004,18.00,paid,,missing date',
        '1005,18.00,paid,2026-03-05,duplicate incoming',
        '1005,18.00,paid,2026-03-05,duplicate incoming',
        '1006,77.40,refund,2026-03-06,clean comma row',
        '1007\t88.10\tpending\t2026-03-07\tuses tabs instead of commas',
        '1008, ,pending,,blank numeric and date',
        ',,,,',
        '1009,"12,300",paid,2026-03-08,"quoted comma"',
        '1010,TRUE,paid,2026-03-09,boolean in numeric column',
        '1011;91.25;paid;2026-03-10;semicolons',
        '1012|93.50|paid|2026-03-11|pipes',
        '1013,"starts fine",paid,2026-03-12,"unterminated quote'
    ].join('\n');
}

export function createBadCsvSampleFile() {
    const text = createBadCsvSampleText();

    return new File([text], 'bad-mixed-delimiters.csv', {
        type: 'text/csv'
    });
}

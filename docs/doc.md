

pghbonpara841
Asdf@123
atuledump6@gmail.com


http://127.0.0.1:1020/att/api/totalTimeCardReportV2/?page=1&page_size=200&start_date=2026-05-07&end_date=2026-05-07&departments=-1&areas=-1&groups=-1&employees=-1


http://127.0.0.1:1020/att/api/totalTimeCardReportV2/?page=1&page_size=20&start_date=2026-05-01&end_date=2026-05-07&departments=1&areas=-1&groups=-1&employees=-1





we want to take data  from the zkteco official application like bio time or any time . 
we actually read ready made data for a user of a day attendances. 

like this formatted data so that we dont need any other day :

model Attendance {
    id             String    @id @default(uuid())
    slNo           String?
    employeeId     String?
    employeeNumber String?
    employeeName   String
    autoAssign     String?
    date           String?
    isoDate        DateTime?
    shift          String?
    onDuty         String?
    offDuty        String?
    clockIn        String?
    clockOut       String?
    normal         String?
    realTime       String?
    late           String?
    early          String?
    absent         String?
    otTime         String?
    workTime       String?
    exception      String?
    mustClockIn    String?
    mustClockOut   String?
    department     String?
    nDays          String?
    weekEnd        String?
    holiday        String?
    attTime        String?
    nDaysOt        String?
    weekEndOt      String?
    holidayOt      String?

    branchId String
    branch   Branch @relation(fields: [branchId], references: [id])

    employee Employee? @relation(fields: [employeeId], references: [id])

    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    @@index([employeeId])
    @@index([branchId])
}

this is jsut for understanding, we dont need all fields data. 

so in the bio time or related officaila application, can we get similer formated data of a day or a user so that we dont need to calcuate his active/working time of a day and dont need calcuate his entering, outgoing times ?

then just save this data in our db










in this application, you can see we have 2 main works:
- get attendance logs from direct postgress database and send to our main server
-get the attendance report data from/via the bio time application's api and also send to our main backend. 
but our code structure, pattern, interval etc. not good  and bad style. 

both api using same main server's url to send data , but the attendance log sending url is ok and timecard report sending url is not correct, actaully not build still in our main server. 

now create a plan how can we centralize this applicatin, better formatted, better pattern, easy controlled etc. 
you can ask me if any question. 
i have some questions :

- what/how interval we can send both data, attendance log and the report time card? every 30 minutes


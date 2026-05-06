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


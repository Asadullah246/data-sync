## data saving prisma schema:

model AttendanceTransaction {
    id            String    @id @default(uuid())
    bioTimeId     String      @unique // 'id' from BioTime
    empCode       String // 'emp_code' from BioTime (should match Employee.employeeNumber)
    punchTime     DateTime // 'punch_time'
    punchState    String // 'punch_state'
    verifyType    Int // 'verify_type'
    workCode      String // 'work_code'
    terminalSn    String // 'terminal_sn'
    terminalAlias String? // 'terminal_alias'
    areaAlias     String? // 'area_alias'
    longitude     String? // 'longitude'
    latitude      String? // 'latitude'
    gpsLocation   String? // 'gps_location'
    mobile        String? // 'mobile'
    source        Int? // 'source'
    purpose       Int? // 'purpose'
    crc           String? // 'crc'
    isAttendance  Boolean   @default(true) // 'is_attendance' (1/0)
    reserved      String? // 'reserved'
    uploadTime    DateTime // 'upload_time'
    syncStatus    Int? // 'sync_status'
    syncTime      DateTime? // 'sync_time'
    isMask        Boolean   @default(false) // 'is_mask' (1/0)
    temperature   String? // 'temperature' (sent as "0.0" or "None")
    externalEmpId Int? // 'emp_id' from BioTime
    terminalId    Int? // 'terminal_id'
    companyCode   String? // 'company_code'

    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    @@index([empCode])
    @@index([punchTime])
    @@index([bioTimeId])
}


{
      "id": "f3885592-0c1b-48e6-a8d4-727d6b200b0f",
      "emp_id": 1,
      "emp_code": "1",
      "first_name": "abc",
      "last_name": null,
      "nick_name": null,
      "gender": null,
      "company_code": "1",
      "company_name": "Company",
      "dept_code": "1",
      "dept_name": "Department 1",
      "position_code": null,
      "position_name": null,
      "att_date": "2026-05-03",
      "weekday": "Sunday",
      "time_table_alias": "Timetable standard",
      "check_in": "09:00",
      "check_out": "18:00",
      "work_day": "1.0",
      "clock_in": null,
      "clock_out": null,
      "break_out": null,
      "break_in": null,
      "att_date_normal": "2026-05-03",
      "time_table_id": 1,
      "full_attendance": 0,
      "duration": "09:00",
      "duty_duration": "08:00",
      "total_hrs": "",
      "worked_hrs": "",
      "actual_worked": "",
      "break_duration": "01:00",
      "break_total_hrs": "01:00",
      "break_hrs": "01:00",
      "actual_break": "",
      "approval_hrs": "",
      "early_in": "",
      "late_out": "",
      "unschedule": "",
      "remaining": "08:00",
      "total_ot": "",
      "rule_total_ot": "",
      "total_leave": "",
      "paycode_1": "",
      "paycode_2": "",
      "paycode_3": "",
      "paycode_4": "8.0",
      "paycode_5": "",
      "paycode_6": "",
      "paycode_7": "",
      "paycode_8": "",
      "paycode_9": "",
      "paycode_10": "",
      "paycode_11": "",
      "paycode_12": "",
      "paycode_13": "",
      "paycode_14": "",
      "paycode_15": "",
      "paycode_16": "",
      "paycode_17": "",
      "paycode_18": ""
    },
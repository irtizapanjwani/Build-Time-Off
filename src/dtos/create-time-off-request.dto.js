import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, IsEnum } from 'class-validator';
import { LeaveType } from '../common/enums/leave-type.enum.js';

export class CreateTimeOffRequestDto {
  @IsString()
  @IsNotEmpty()
  employeeId;

  @IsString()
  @IsNotEmpty()
  locationId;

  @IsEnum(LeaveType)
  leaveType;

  @IsDateString()
  startDate;

  @IsDateString()
  endDate;

  @IsNumber()
  @Min(0.1)
  daysRequested;
}

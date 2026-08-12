import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  findAll() {
    return this.plansService.findAll();
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':planId')
  update(@Param('planId') planId: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(planId, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Delete(':planId')
  @HttpCode(204)
  remove(@Param('planId') planId: string) {
    return this.plansService.remove(planId);
  }
}

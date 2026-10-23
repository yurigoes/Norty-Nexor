import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { OrganizationsService } from './organizations.service';
import {
  AuditQueryDto, BranchDto, DecisionDto, InviteUserDto, MessageDto, RoleDto, SupportTicketDto, UpdateBranchDto,
  UpdateMembershipDto, UpdateOrganizationDto, UpdateRoleDto,
} from './dto';

@Controller()
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get('organization')
  profile(@OrgCtx() ctx: OrgContext) {
    return this.orgs.profile(ctx);
  }

  @RequirePermission('settings.manage')
  @Patch('organization')
  update(@OrgCtx() ctx: OrgContext, @Body() dto: UpdateOrganizationDto) {
    return this.orgs.update(ctx, dto);
  }

  @Get('branches')
  branches(@OrgCtx() ctx: OrgContext, @Query('all') all?: string) {
    return this.orgs.branches(ctx, all === 'true');
  }

  @RequirePermission('branches.manage')
  @Post('branches')
  createBranch(@OrgCtx() ctx: OrgContext, @Body() dto: BranchDto) {
    return this.orgs.createBranch(ctx, dto);
  }

  @RequirePermission('branches.manage')
  @Patch('branches/:id')
  updateBranch(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    return this.orgs.updateBranch(ctx, id, dto);
  }

  @RequirePermission('roles.manage')
  @Get('roles')
  roles(@OrgCtx() ctx: OrgContext) {
    return this.orgs.roles(ctx);
  }

  @RequirePermission('roles.manage')
  @Post('roles')
  createRole(@OrgCtx() ctx: OrgContext, @Body() dto: RoleDto) {
    return this.orgs.createRole(ctx, dto);
  }

  @RequirePermission('roles.manage')
  @Patch('roles/:id')
  updateRole(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.orgs.updateRole(ctx, id, dto);
  }

  @RequirePermission('roles.manage')
  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRole(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.deleteRole(ctx, id);
  }

  @RequirePermission('users.manage')
  @Get('members')
  members(@OrgCtx() ctx: OrgContext) {
    return this.orgs.members(ctx);
  }

  @RequirePermission('users.manage')
  @Post('members')
  invite(@OrgCtx() ctx: OrgContext, @Body() dto: InviteUserDto) {
    return this.orgs.invite(ctx, dto);
  }

  @RequirePermission('users.manage')
  @Patch('members/:id')
  updateMember(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMembershipDto) {
    return this.orgs.updateMember(ctx, id, dto);
  }

  @RequirePermission('users.manage')
  @Post('members/:id/reset-link')
  resetLink(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.resetLink(ctx, id);
  }

  @RequirePermission('support.approve')
  @Get('support/grants')
  grants(@OrgCtx() ctx: OrgContext) {
    return this.orgs.supportGrants(ctx);
  }

  @RequirePermission('support.approve')
  @Post('support/grants/:id/approve')
  approve(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.orgs.decideGrant(ctx, id, 'APPROVED', dto.note);
  }

  @RequirePermission('support.approve')
  @Post('support/grants/:id/reject')
  reject(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.orgs.decideGrant(ctx, id, 'REJECTED', dto.note);
  }

  @RequirePermission('support.approve')
  @Post('support/grants/:id/revoke')
  revoke(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.orgs.decideGrant(ctx, id, 'REVOKED', dto.note);
  }

  @RequirePermission('settings.manage')
  @Get('support/tickets')
  tickets(@OrgCtx() ctx: OrgContext) {
    return this.orgs.supportTickets(ctx);
  }

  @RequirePermission('settings.manage')
  @Post('support/tickets')
  openTicket(@OrgCtx() ctx: OrgContext, @Body() dto: SupportTicketDto) {
    return this.orgs.openTicket(ctx, dto.subject, dto.description);
  }

  @RequirePermission('settings.manage')
  @Post('support/tickets/:id/messages')
  reply(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) {
    return this.orgs.replyTicket(ctx, id, dto.body);
  }

  @RequirePermission('audit.view')
  @Get('audit')
  audit(@OrgCtx() ctx: OrgContext, @Query() query: AuditQueryDto) {
    return this.orgs.auditLog(ctx, query);
  }
}

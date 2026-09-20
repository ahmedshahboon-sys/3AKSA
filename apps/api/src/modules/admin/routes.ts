import type { FastifyInstance,FastifyReply,FastifyRequest } from 'fastify';
import {
  adminContext,adminMfaState,auditAdminAction,beginMfaEnrollment,confirmMfaEnrollment,
  hasAdminRole,requireAdminMfa
} from './security.js';
import {
  adminApproveTopup,adminAuditLog,adminBanUser,adminBreakGlassPrivateMessages,
  adminDeleteUser,adminListPendingTopups,adminListReports,adminListUsers,
  adminOverview,adminRejectTopup,adminResetPassword,adminReviewReport,
  adminUnbanUser,adminUserDetail
} from './service.js';
import {
  approveRecoveryRequest,listPendingRecoveryRequests,rejectRecoveryRequest
} from '../auth/recovery.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function superAdmin(request:FastifyRequest,reply:FastifyReply,withMfa=true){
  const context=await adminContext(request,reply);
  if(!context)return null;
  if(!hasAdminRole(context,'super_admin')){
    reply.code(403).send({error:'SUPER_ADMIN_REQUIRED'});
    return null;
  }
  if(withMfa&&!(await requireAdminMfa(context,request,reply)))return null;
  return context;
}

function adminError(reply:FastifyReply,error:unknown){
  const code=error instanceof Error?error.message:'ADMIN_OPERATION_FAILED';
  if(code==='ADMIN_USER_NOT_FOUND'||code==='ADMIN_REPORT_NOT_FOUND'||code==='TOPUP_REQUEST_NOT_FOUND'||code==='CONVERSATION_NOT_FOUND'||code==='RECOVERY_REQUEST_NOT_FOUND'){
    return reply.code(404).send({error:code});
  }
  if(code==='SUPER_ADMIN_TARGET_PROTECTED'||code==='ADMIN_USER_ALREADY_DELETED'||code==='ADMIN_USER_NOT_ACTIVE'||code==='TOPUP_REQUEST_NOT_PENDING'){
    return reply.code(409).send({error:code});
  }
  if(code==='INVALID_CREDENTIALS'||code==='ADMIN_MFA_INVALID'){
    return reply.code(403).send({error:code});
  }
  if(code==='ADMIN_MFA_SETUP_EXPIRED'){
    return reply.code(410).send({error:code});
  }
  if(code==='ADMIN_REASON_REQUIRED'||code==='BREAK_GLASS_REASON_REQUIRED'||code==='WEAK_PASSWORD'){
    return reply.code(400).send({error:code});
  }
  throw error;
}

export async function registerAdminRoutes(app:FastifyInstance,options:{basePath:string}){
  const prefix=`${options.basePath}/admin`;

  app.get(`${prefix}/me`,async(request,reply)=>{
    const context=await adminContext(request,reply);
    if(!context)return;
    return reply.send({...context,mfa:await adminMfaState(context.user.id)});
  });

  app.post<{Body:{password?:string}}>(`${prefix}/security/mfa/setup`,async(request,reply)=>{
    const context=await superAdmin(request,reply,false);
    if(!context)return;
    try{
      return reply.send(await beginMfaEnrollment(context.user.id,request.body.password??''));
    }catch(error){return adminError(reply,error);}
  });

  app.post<{Body:{code?:string}}>(`${prefix}/security/mfa/confirm`,async(request,reply)=>{
    const context=await superAdmin(request,reply,false);
    if(!context)return;
    try{
      return reply.send(await confirmMfaEnrollment(context.user.id,request.body.code?.trim()??''));
    }catch(error){return adminError(reply,error);}
  });

  app.get(`${prefix}/overview`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    return reply.send({overview:await adminOverview()});
  });

  app.get<{Querystring:{limit?:string}}>(`${prefix}/recovery`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    const limit=Math.min(Math.max(Number(request.query.limit)||100,1),200);
    return reply.send({requests:await listPendingRecoveryRequests(limit)});
  });

  app.post<{Params:{requestId:string}}>(`${prefix}/recovery/:requestId/approve`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{
      const result=await approveRecoveryRequest(context.user.id,request.params.requestId);
      await auditAdminAction(null,context.user.id,'password_recovery_approved',{
        targetUserId:result.userId,
        metadata:{requestId:result.requestId}
      });
      return reply.send({recovery:result});
    }catch(error){return adminError(reply,error);}
  });

  app.post<{Params:{requestId:string}}>(`${prefix}/recovery/:requestId/reject`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{
      const result=await rejectRecoveryRequest(context.user.id,request.params.requestId);
      await auditAdminAction(null,context.user.id,'password_recovery_rejected',{
        targetUserId:result.userId,
        metadata:{requestId:result.requestId}
      });
      return reply.send({recovery:result});
    }catch(error){return adminError(reply,error);}
  });

  app.get<{Querystring:{search?:string;status?:string;limit?:string}}>(`${prefix}/users`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    const status=request.query.status;
    if(status&&status!=='active'&&status!=='banned'&&status!=='deleted'){
      return reply.code(400).send({error:'INVALID_USER_STATUS'});
    }
    const limit=Math.min(Math.max(Number(request.query.limit)||50,1),100);
    return reply.send({users:await adminListUsers({
      ...(request.query.search?{search:request.query.search}:{}),
      ...(status?{status:status as 'active'|'banned'|'deleted'}:{}),
      limit
    })});
  });

  app.get<{Params:{userId:string}}>(`${prefix}/users/:userId`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    if(!UUID_RE.test(request.params.userId))return reply.code(404).send({error:'ADMIN_USER_NOT_FOUND'});
    try{return reply.send({user:await adminUserDetail(request.params.userId)});}
    catch(error){return adminError(reply,error);}
  });

  app.post<{Params:{userId:string};Body:{reason?:string}}>(`${prefix}/users/:userId/ban`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{return reply.send({user:await adminBanUser(context.user.id,request.params.userId,request.body.reason??'')});}
    catch(error){return adminError(reply,error);}
  });

  app.post<{Params:{userId:string};Body:{reason?:string}}>(`${prefix}/users/:userId/unban`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{return reply.send({user:await adminUnbanUser(context.user.id,request.params.userId,request.body.reason??'')});}
    catch(error){return adminError(reply,error);}
  });

  app.post<{Params:{userId:string};Body:{reason?:string}}>(`${prefix}/users/:userId/delete`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{return reply.send({user:await adminDeleteUser(context.user.id,request.params.userId,request.body.reason??'')});}
    catch(error){return adminError(reply,error);}
  });

  app.post<{Params:{userId:string};Body:{newPassword?:string;reason?:string}}>(`${prefix}/users/:userId/password-reset`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{
      return reply.send({result:await adminResetPassword(
        context.user.id,request.params.userId,request.body.newPassword??'',request.body.reason??''
      )});
    }catch(error){return adminError(reply,error);}
  });

  app.get<{Querystring:{status?:string;limit?:string}}>(`${prefix}/reports`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    const status=request.query.status;
    if(status&&status!=='open'&&status!=='reviewing'&&status!=='closed'){
      return reply.code(400).send({error:'INVALID_REPORT_STATUS'});
    }
    return reply.send({reports:await adminListReports(
      status as 'open'|'reviewing'|'closed'|undefined,
      Math.min(Math.max(Number(request.query.limit)||100,1),200)
    )});
  });

  app.patch<{Params:{reportId:string};Body:{status?:string;note?:string|null}}>(`${prefix}/reports/:reportId`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    if(request.body.status!=='reviewing'&&request.body.status!=='closed'){
      return reply.code(400).send({error:'INVALID_REPORT_STATUS'});
    }
    try{
      return reply.send({report:await adminReviewReport(
        context.user.id,request.params.reportId,request.body.status,request.body.note??null
      )});
    }catch(error){return adminError(reply,error);}
  });

  app.get<{Querystring:{limit?:string}}>(`${prefix}/topups`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    return reply.send({topups:await adminListPendingTopups(
      Math.min(Math.max(Number(request.query.limit)||100,1),200)
    )});
  });

  app.post<{Params:{requestId:string}}>(`${prefix}/topups/:requestId/approve`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{return reply.send(await adminApproveTopup(context.user.id,request.params.requestId));}
    catch(error){return adminError(reply,error);}
  });

  app.post<{Params:{requestId:string}}>(`${prefix}/topups/:requestId/reject`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{return reply.send(await adminRejectTopup(context.user.id,request.params.requestId));}
    catch(error){return adminError(reply,error);}
  });

  app.post<{Params:{conversationId:string};Body:{reason?:string;limit?:number}}>(`${prefix}/break-glass/private/:conversationId/messages`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    try{
      return reply.send(await adminBreakGlassPrivateMessages(
        context.user.id,request.params.conversationId,request.body.reason??'',request.body.limit??100
      ));
    }catch(error){return adminError(reply,error);}
  });

  app.get<{Querystring:{limit?:string}}>(`${prefix}/audit`,async(request,reply)=>{
    const context=await superAdmin(request,reply);
    if(!context)return;
    return reply.send({audit:await adminAuditLog(
      Math.min(Math.max(Number(request.query.limit)||100,1),250)
    )});
  });
}

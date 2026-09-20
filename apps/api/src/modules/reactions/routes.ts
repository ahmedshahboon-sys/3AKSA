import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest } from '../auth/session.js';
import {
  deletePrivateLike,
  deleteRoomLike,
  getPrivateLikeSummary,
  getRoomLikeSummary,
  putPrivateLike,
  putRoomLike
} from './service.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireUser(request:FastifyRequest,reply:FastifyReply){
  const user=await authenticateRequest(request);
  if(!user) reply.code(401).send({error:'UNAUTHORIZED'});
  return user;
}

function validIds(...values:string[]){return values.every((v)=>UUID_RE.test(v));}

export async function registerReactionRoutes(app:FastifyInstance,options:{basePath:string}){
  const roomPath=`${options.basePath}/rooms/:roomId/messages/:messageId/reactions/like`;
  const privatePath=`${options.basePath}/private/conversations/:conversationId/messages/:messageId/reactions/like`;

  app.get<{Params:{roomId:string;messageId:string}}>(roomPath,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!validIds(request.params.roomId,request.params.messageId)) return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});
    try{return reply.send({like:await getRoomLikeSummary(user,request.params.roomId,request.params.messageId)});}
    catch(error){if(error instanceof Error&&error.message==='MESSAGE_NOT_FOUND')return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});throw error;}
  });

  app.put<{Params:{roomId:string;messageId:string}}>(roomPath,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!validIds(request.params.roomId,request.params.messageId)) return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});
    try{return reply.send({like:await putRoomLike(user,request.params.roomId,request.params.messageId)});}
    catch(error){if(error instanceof Error&&error.message==='MESSAGE_NOT_FOUND')return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});throw error;}
  });

  app.delete<{Params:{roomId:string;messageId:string}}>(roomPath,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!validIds(request.params.roomId,request.params.messageId)) return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});
    try{return reply.send({like:await deleteRoomLike(user,request.params.roomId,request.params.messageId)});}
    catch(error){if(error instanceof Error&&error.message==='MESSAGE_NOT_FOUND')return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});throw error;}
  });

  app.get<{Params:{conversationId:string;messageId:string}}>(privatePath,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!validIds(request.params.conversationId,request.params.messageId)) return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});
    try{return reply.send({like:await getPrivateLikeSummary(user.id,request.params.conversationId,request.params.messageId)});}
    catch(error){if(error instanceof Error&&error.message==='MESSAGE_NOT_FOUND')return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});throw error;}
  });

  app.put<{Params:{conversationId:string;messageId:string}}>(privatePath,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!validIds(request.params.conversationId,request.params.messageId)) return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});
    try{return reply.send({like:await putPrivateLike(user.id,request.params.conversationId,request.params.messageId)});}
    catch(error){if(error instanceof Error&&error.message==='MESSAGE_NOT_FOUND')return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});throw error;}
  });

  app.delete<{Params:{conversationId:string;messageId:string}}>(privatePath,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!validIds(request.params.conversationId,request.params.messageId)) return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});
    try{return reply.send({like:await deletePrivateLike(user.id,request.params.conversationId,request.params.messageId)});}
    catch(error){if(error instanceof Error&&error.message==='MESSAGE_NOT_FOUND')return reply.code(404).send({error:'MESSAGE_NOT_FOUND'});throw error;}
  });
}

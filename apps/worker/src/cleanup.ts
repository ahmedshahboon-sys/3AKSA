import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

export type CleanupOptions={
  db:Pool;
  storageDriver:string;
  storageRoot:string;
  batchSize?:number;
  shouldStop?:()=>boolean;
  onError?:(message:string,extra:Record<string,unknown>)=>void;
};

function safeStoragePath(root:string,storageKey:string){
  const resolvedRoot=path.resolve(root);
  const full=path.resolve(resolvedRoot,storageKey);
  if(!full.startsWith(`${resolvedRoot}${path.sep}`))throw new Error('INVALID_STORAGE_KEY');
  return full;
}

async function deleteVoiceFile(storageDriver:string,storageRoot:string,storageKey:string|null){
  if(!storageKey||storageDriver!=='local')return;
  try{
    await fs.unlink(safeStoragePath(storageRoot,storageKey));
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  }
}

async function purgeMessageTable(
  table:'room_messages'|'private_messages',
  options:CleanupOptions
){
  const batchSize=options.batchSize??500;
  let deletedTotal=0;
  while(!(options.shouldStop?.()??false)){
    const doomed=await options.db.query<{id:string;storage_key:string|null}>(
      `SELECT id,storage_key
       FROM ${table}
       WHERE expires_at<=now() OR deleted_at IS NOT NULL
       ORDER BY expires_at
       LIMIT $1`,
      [batchSize]
    );
    if(doomed.rows.length===0)break;

    const removableIds:string[]=[];
    for(const row of doomed.rows){
      try{
        await deleteVoiceFile(options.storageDriver,options.storageRoot,row.storage_key);
        removableIds.push(row.id);
      }catch(error){
        options.onError?.('voice file cleanup failed',{
          table,id:row.id,error:error instanceof Error?error.message:String(error)
        });
      }
    }

    if(removableIds.length>0){
      const removed=await options.db.query(
        `DELETE FROM ${table} WHERE id=ANY($1::uuid[])`,
        [removableIds]
      );
      deletedTotal+=removed.rowCount??0;
    }

    if(doomed.rows.length<batchSize||removableIds.length===0)break;
  }
  return deletedTotal;
}

async function purgeExpiredNotifications(options:CleanupOptions){
  const batchSize=options.batchSize??500;
  let deletedTotal=0;
  while(!(options.shouldStop?.()??false)){
    const removed=await options.db.query<{id:string}>(
      `WITH doomed AS (
         SELECT id FROM notifications
         WHERE expires_at<=now()
         ORDER BY expires_at
         LIMIT $1
       )
       DELETE FROM notifications n
       USING doomed d
       WHERE n.id=d.id
       RETURNING n.id`,
      [batchSize]
    );
    deletedTotal+=removed.rowCount??0;
    if((removed.rowCount??0)<batchSize)break;
  }
  return deletedTotal;
}

export async function purgeExpiredEphemeralData(options:CleanupOptions){
  const roomDeleted=await purgeMessageTable('room_messages',options);
  const privateDeleted=await purgeMessageTable('private_messages',options);
  const notificationDeleted=await purgeExpiredNotifications(options);
  return {
    roomDeleted,
    privateDeleted,
    notificationDeleted,
    deleted:roomDeleted+privateDeleted+notificationDeleted
  };
}

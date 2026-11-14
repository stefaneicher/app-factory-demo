import Fastify from 'fastify';
import {z} from 'zod';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const path=resolve(process.env.DATA_FILE??'./data/tasks.json');
const Task=z.object({id:z.string().uuid(),title:z.string().min(1).max(200),done:z.boolean()});
type Task=z.infer<typeof Task>;
const NewTask=Task.pick({title:true});
const app=Fastify({logger:true,bodyLimit:65536});
let queue=Promise.resolve();
async function load():Promise<Task[]>{try{return z.array(Task).parse(JSON.parse(await readFile(path,'utf8')))}catch(e:any){if(e.code==='ENOENT')return [];throw e}}
async function save(tasks:Task[]){await mkdir(dirname(path),{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(tasks,null,2));await rename(tmp,path)}
function mutate<T>(fn:()=>Promise<T>):Promise<T>{const result=queue.then(fn);queue=result.then(()=>undefined,()=>undefined);return result}
app.get('/health',async()=>({status:'ok'}));
app.get('/tasks',async()=>load());
app.post('/tasks',async(req,reply)=>{const parsed=NewTask.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Invalid task'});return mutate(async()=>{const tasks=await load();const task:Task={id:randomUUID(),title:parsed.data.title,done:false};tasks.push(task);await save(tasks);return reply.code(201).send(task)})});
app.patch('/tasks/:id',async(req,reply)=>{const params=z.object({id:z.string().uuid()}).safeParse(req.params);const body=z.object({done:z.boolean()}).safeParse(req.body);if(!params.success||!body.success)return reply.code(400).send({error:'Invalid input'});return mutate(async()=>{const tasks=await load();const task=tasks.find(t=>t.id===params.data.id);if(!task)return reply.code(404).send({error:'Not found'});task.done=body.data.done;await save(tasks);return task})});
app.delete('/tasks/:id',async(req,reply)=>{const params=z.object({id:z.string().uuid()}).safeParse(req.params);if(!params.success)return reply.code(400).send({error:'Invalid id'});return mutate(async()=>{const tasks=await load();const next=tasks.filter(t=>t.id!==params.data.id);if(next.length===tasks.length)return reply.code(404).send({error:'Not found'});await save(next);return reply.code(204).send()})});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void app.close());
await app.listen({host:'127.0.0.1',port:Number(process.env.PORT??3000)});

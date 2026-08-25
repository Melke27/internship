import {FormEvent,useState} from 'react'; import {useAuth,hasPermission} from '../../context/AuthContext'; import {useCreateDistrict,useUpdateDistrict,useDeleteDistrict,DistrictInput} from '../../services/organization'; import {isAxiosError} from 'axios';

export interface DistrictRow{id:number;name:string;code:string;description?:string;address?:string;phone?:string;email?:string;status:string}

const EMPTY:DistrictInput={name:'',code:'',description:'',address:'',phone:'',email:'',status:'ACTIVE'};

export function DistrictDialog({row,onClose}:{row:DistrictRow|null;onClose:()=>void}){
const create=useCreateDistrict();const update=useUpdateDistrict();
const [form,setForm]=useState<DistrictInput>(row?{name:row.name,code:row.code,description:row.description||'',address:row.address||'',phone:row.phone||'',email:row.email||'',status:row.status}:EMPTY);
const [error,setError]=useState('');
function set<K extends keyof DistrictInput>(key:K,value:DistrictInput[K]){setForm(f=>({...f,[key]:value}))}
async function submit(e:FormEvent){e.preventDefault();setError('');
try{if(row)await update.mutateAsync({id:row.id,...form});else await create.mutateAsync(form);onClose()}
catch(err){if(isAxiosError(err)&&err.response?.data){const data=err.response.data as Record<string,unknown>;const first=typeof data.detail==='string'?data.detail:Object.entries(data).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join(' · ');setError(first||'Request failed.')}else setError('Unable to reach the Django API.')}}
return <div className="dialog-backdrop" onClick={onClose}><form className="panel dialog" onClick={e=>e.stopPropagation()} onSubmit={submit}>
<h2>{row?'Edit district':'New district'}</h2>
<label>Name<input required value={form.name} onChange={e=>set('name',e.target.value)}/></label>
<label>Code<input required value={form.code} onChange={e=>set('code',e.target.value)}/></label>
<div className="dialog-grid">
<label>Status<select value={form.status} onChange={e=>set('status',e.target.value)}>{['ACTIVE','INACTIVE'].map(s=><option key={s}>{s}</option>)}</select></label>
<label>Phone<input value={form.phone} onChange={e=>set('phone',e.target.value)}/></label>
</div>
<label>Email<input type="email" value={form.email} onChange={e=>set('email',e.target.value)}/></label>
<label>Address<input value={form.address} onChange={e=>set('address',e.target.value)}/></label>
<label>Description<textarea rows={2} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
{error&&<div className="form-error">{error}</div>}
<div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={create.isPending||update.isPending}>{row?'Save changes':'Create district'}</button></div>
</form></div>}

export function DistrictRowActions({row,onEdit}:{row:DistrictRow;onEdit:()=>void}){
const {currentUser}=useAuth();const del=useDeleteDistrict();const [confirming,setConfirming]=useState(false);const [error,setError]=useState('');
if(!hasPermission(currentUser,'district.delete')&&!hasPermission(currentUser,'district.update'))return null;
async function remove(){try{await del.mutateAsync(row.id);setConfirming(false)}catch(err){setError(isAxiosError(err)&&err.response?.data?.detail?String(err.response.data.detail):'Delete failed.');}}
return <td className="row-actions">{hasPermission(currentUser,'district.update')&&<button className="button secondary" onClick={onEdit}>Edit</button>}{hasPermission(currentUser,'district.delete')&&(confirming?<><button className="button danger" disabled={del.isPending} onClick={remove}>Confirm delete</button><button className="button secondary" onClick={()=>setConfirming(false)}>Keep</button></>:<button className="button secondary" onClick={()=>setConfirming(true)}>Delete</button>)}{error&&<small className="form-error">{error}</small>}</td>}

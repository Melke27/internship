import {useMutation,useQueryClient} from '@tanstack/react-query'; import {api} from '../lib/api';

export interface DistrictInput{name:string;code:string;description?:string;address?:string;phone?:string;email?:string;status?:string}

function useInvalidateDistricts(){const queryClient=useQueryClient();return()=>{queryClient.invalidateQueries({queryKey:['districts']});queryClient.invalidateQueries({queryKey:['dashboard-summary']})}}

export const useCreateDistrict=()=>{const invalidate=useInvalidateDistricts();return useMutation({mutationFn:(payload:DistrictInput)=>api.post('/districts/',payload).then(r=>r.data),onSuccess:invalidate})};
export const useUpdateDistrict=()=>{const invalidate=useInvalidateDistricts();return useMutation({mutationFn:({id,...payload}:{id:number}&DistrictInput)=>api.patch(`/districts/${id}/`,payload).then(r=>r.data),onSuccess:invalidate})};
export const useDeleteDistrict=()=>{const invalidate=useInvalidateDistricts();return useMutation({mutationFn:(id:number)=>api.delete(`/districts/${id}/`),onSuccess:invalidate})};

export interface TreeNode{name:string;code?:string;status?:string;children?:TreeNode[];meta?:string}

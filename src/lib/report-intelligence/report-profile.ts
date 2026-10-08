import type {CanonicalField} from './canonical-schema';
import type {FieldMapping} from './semantic-field-mapper';
export interface ReportProfile{profileId:string;sourceSignature:string;sourceName?:string;version:number;mappings:Record<string,CanonicalField>;createdAt:string;updatedAt:string;useCount:number;}
export function buildProfile(profileId:string,sourceSignature:string,mappings:FieldMapping[],now=new Date().toISOString()):ReportProfile{const valid=mappings.filter(m=>m.field);return{profileId,sourceSignature,version:1,mappings:Object.fromEntries(valid.map(m=>[m.sourceHeader,m.field!])),createdAt:now,updatedAt:now,useCount:0};}
export function applyProfile(profile:ReportProfile,headers:string[]):FieldMapping[]{return headers.map(sourceHeader=>{const field=profile.mappings[sourceHeader];return field?{sourceHeader,field,confidence:1,method:'manual',requiresReview:false}:{sourceHeader,confidence:0,method:'unmapped',requiresReview:true};});}

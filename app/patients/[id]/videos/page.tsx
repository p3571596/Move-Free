import {AppShell} from "@/components/AppShell";
import {RequireAuth} from "@/components/RequireAuth";
import {RoleGate} from "@/components/RoleGate";
import {VideoWorkspace} from "@/components/VideoWorkspace";
export default async function VideosPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AppShell><RequireAuth><RoleGate allowed={["clinician","admin"]}><VideoWorkspace patientId={id}/></RoleGate></RequireAuth></AppShell>;}

import {AppShell} from "@/components/AppShell";
import {RequireAuth} from "@/components/RequireAuth";
import {RoleGate} from "@/components/RoleGate";
import {CareConversation} from "@/components/CareConversation";
export default async function MessagesPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AppShell><RequireAuth><RoleGate allowed={["clinician","admin"]}><CareConversation patientId={id}/></RoleGate></RequireAuth></AppShell>;}

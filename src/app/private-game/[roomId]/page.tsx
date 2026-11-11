import { PrivateGameTable } from "@/components/game/PrivateGameTable";

export default async function PrivateGamePage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <PrivateGameTable roomId={roomId} />;
}

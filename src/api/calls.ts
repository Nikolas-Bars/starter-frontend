import { http } from '@/api/http'
import type { Call, IceServer, Paginated } from '@/types/api'

export const callsApi = {
  history: (page = 1) => http.get<Paginated<Call>>(`calls?page=${page}`),
  iceServers: () => http.get<{ ice_servers: IceServer[] }>('calls/ice-servers'),
}

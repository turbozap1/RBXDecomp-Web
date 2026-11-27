import argparse
import asyncio
import contextlib
import socket

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed


async def relay(connection, upstream, emscripten=False):
    loop = asyncio.get_running_loop()
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.setblocking(False)
    try:
        await loop.sock_connect(udp, upstream)

        async def to_udp():
            first = True
            async for message in connection:
                if not isinstance(message, bytes):
                    await connection.close(1003, "Binary datagrams required")
                    return
                if first and emscripten:
                    first = False
                    if len(message) == 10 and message[:8] == b"\xff\xff\xff\xffport":
                        continue
                await loop.sock_sendto(udp, message, upstream)

        async def to_websocket():
            while True:
                data = await loop.sock_recv(udp, 65507)
                await connection.send(data)

        tasks = [asyncio.create_task(to_udp()), asyncio.create_task(to_websocket())]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
    except ConnectionClosed:
        pass
    except OSError:
        await connection.close(1011, "UDP upstream unavailable")
    finally:
        udp.close()


async def run(args):
    loop = asyncio.get_running_loop()
    addresses = await loop.getaddrinfo(args.upstream, args.upstream_port, family=socket.AF_INET, type=socket.SOCK_DGRAM)
    upstream = addresses[0][4]
    async with serve(
        lambda connection: relay(connection, upstream, args.emscripten), args.listen, args.port,
        origins=args.origin, max_size=65507, max_queue=16, compression=None,
    ):
        print(f"WebSocket {args.listen}:{args.port} -> UDP {upstream[0]}:{upstream[1]}", flush=True)
        await asyncio.Future()


def main():
    parser = argparse.ArgumentParser(description="One binary WebSocket message per UDP datagram; no RakNet or game-join implementation.")
    parser.add_argument("--listen", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--upstream", required=True)
    parser.add_argument("--upstream-port", type=int, required=True)
    parser.add_argument("--origin", action="append", default=None)
    parser.add_argument("--emscripten", action="store_true", help="Consume Emscripten's initial UDP port announcement before relaying game packets")
    args = parser.parse_args()
    if args.origin is None:
        args.origin = ["http://127.0.0.1:8000", "http://localhost:8000"]
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run(args))


if __name__ == "__main__":
    main()

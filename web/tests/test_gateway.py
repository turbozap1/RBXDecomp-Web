import asyncio
import socket
import unittest

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed, InvalidStatus

from web.gateway import relay


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    emscripten = False
    async def asyncSetUp(self):
        loop = asyncio.get_running_loop()
        self.udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.udp.setblocking(False)
        self.udp.bind(("127.0.0.1", 0))
        upstream = self.udp.getsockname()

        async def echo():
            while True:
                data, address = await loop.sock_recvfrom(self.udp, 65507)
                await loop.sock_sendto(self.udp, data, address)

        self.echo = asyncio.create_task(echo())
        self.server = await serve(
            lambda ws: relay(ws, upstream, self.emscripten), "127.0.0.1", 0,
            origins=["http://127.0.0.1:8000"], max_size=65507, compression=None,
        )
        self.url = f"ws://127.0.0.1:{self.server.sockets[0].getsockname()[1]}"

    async def asyncTearDown(self):
        self.server.close()
        await self.server.wait_closed()
        self.echo.cancel()
        await asyncio.gather(self.echo, return_exceptions=True)
        self.udp.close()

    async def test_binary_datagrams(self):
        async with connect(self.url, origin="http://127.0.0.1:8000") as ws:
            for payload in [b"\x00\xff\x01", b"", b"separate", bytes(range(256))]:
                await ws.send(payload)
                self.assertEqual(await asyncio.wait_for(ws.recv(), 3), payload)

    async def test_text_rejected(self):
        async with connect(self.url, origin="http://127.0.0.1:8000") as ws:
            await ws.send("text")
            with self.assertRaises(ConnectionClosed) as error:
                await ws.recv()
            self.assertEqual(error.exception.rcvd.code, 1003)

    async def test_origin_rejected(self):
        with self.assertRaises(InvalidStatus):
            async with connect(self.url, origin="https://unrelated.invalid"):
                pass


class EmscriptenGatewayTests(GatewayTests):
    emscripten = True

    async def test_port_announcement_is_consumed(self):
        async with connect(self.url, origin="http://127.0.0.1:8000") as ws:
            await ws.send(b"\xff\xff\xff\xffport\x12\x34")
            await ws.send(b"game packet")
            self.assertEqual(await asyncio.wait_for(ws.recv(), 3), b"game packet")


if __name__ == "__main__":
    unittest.main()

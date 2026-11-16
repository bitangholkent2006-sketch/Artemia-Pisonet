using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ArtemiaRemoteInput {
    class Program {
        [StructLayout(LayoutKind.Sequential)]
        struct POINT {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT {
            public uint type; // 0 = INPUT_MOUSE, 1 = INPUT_KEYBOARD, 2 = INPUT_HARDWARE
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct InputUnion {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
            [FieldOffset(0)]
            public KEYBDINPUT ki;
            [FieldOffset(0)]
            public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct HARDWAREINPUT {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }

        [DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint nInputs, [In, MarshalAs(UnmanagedType.LPArray)] INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern uint MapVirtualKey(uint uCode, uint uMapType);

        [DllImport("user32.dll")]
        static extern short VkKeyScan(char ch);

        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        static extern IntPtr WindowFromPoint(POINT Point);

        [DllImport("user32.dll")]
        static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();

        const uint INPUT_MOUSE = 0;
        const uint INPUT_KEYBOARD = 1;

        const uint MOUSEEVENTF_MOVE = 0x0001;
        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;
        const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_SCANCODE = 0x0008;

        static bool IsExtendedKey(ushort vk) {
            return (vk == 0x21 || vk == 0x22 || vk == 0x23 || vk == 0x24 ||
                    vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28 ||
                    vk == 0x2D || vk == 0x2E || vk == 0x5B || vk == 0x5C ||
                    vk == 0x5D || vk == 0x6F || vk == 0xA3 || vk == 0xA5);
        }

        static void SendHardwareKeyDown(ushort vk) {
            ushort scan = (ushort)MapVirtualKey(vk, 0);
            uint flags = KEYEVENTF_SCANCODE;
            if (IsExtendedKey(vk)) flags |= KEYEVENTF_EXTENDEDKEY;

            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = vk;
            inputs[0].u.ki.wScan = scan;
            inputs[0].u.ki.dwFlags = flags;
            inputs[0].u.ki.time = 0;
            inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;

            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        static void SendHardwareKeyUp(ushort vk) {
            ushort scan = (ushort)MapVirtualKey(vk, 0);
            uint flags = KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
            if (IsExtendedKey(vk)) flags |= KEYEVENTF_EXTENDEDKEY;

            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = vk;
            inputs[0].u.ki.wScan = scan;
            inputs[0].u.ki.dwFlags = flags;
            inputs[0].u.ki.time = 0;
            inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;

            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        static void SendHardwareKeyTap(ushort vk) {
            SendHardwareKeyDown(vk);
            Thread.Sleep(30); // 30ms hold ensures 60fps/120fps DirectX engines register the press
            SendHardwareKeyUp(vk);
        }

        static void SendHardwareKeyCombo(params ushort[] vks) {
            foreach (var vk in vks) {
                SendHardwareKeyDown(vk);
                Thread.Sleep(8);
            }
            Thread.Sleep(20);
            for (int i = vks.Length - 1; i >= 0; i--) {
                SendHardwareKeyUp(vks[i]);
                Thread.Sleep(8);
            }
        }

        static ushort ResolveVirtualKey(string keyName) {
            if (string.IsNullOrEmpty(keyName)) return 0;
            string k = keyName.Trim().ToLower();

            // Letters a-z
            if (k.Length == 1 && k[0] >= 'a' && k[0] <= 'z') {
                return (ushort)(0x41 + (k[0] - 'a'));
            }
            // Digits 0-9
            if (k.Length == 1 && k[0] >= '0' && k[0] <= '9') {
                return (ushort)(0x30 + (k[0] - '0'));
            }

            // Keyboard navigation & controls
            switch (k) {
                case "enter": case "{enter}": case "return": return 0x0D;
                case "backspace": case "{backspace}": case "{bs}": return 0x08;
                case "tab": case "{tab}": return 0x09;
                case "space": case " ": return 0x20;
                case "esc": case "escape": case "{esc}": return 0x1B;
                case "delete": case "{delete}": return 0x2E;
                case "insert": case "{insert}": return 0x2D;
                case "home": case "{home}": return 0x24;
                case "end": case "{end}": return 0x23;
                case "pageup": case "{pgup}": return 0x21;
                case "pagedown": case "{pgdn}": return 0x22;
                case "up": case "{up}": return 0x26;
                case "down": case "{down}": return 0x28;
                case "left": case "{left}": return 0x25;
                case "right": case "{right}": return 0x27;
                case "shift": case "lshift": return 0x10;
                case "rshift": return 0xA1;
                case "ctrl": case "control": case "lctrl": return 0x11;
                case "rctrl": return 0xA3;
                case "alt": case "lalt": return 0x12;
                case "ralt": return 0xA5;
                case "win": case "start": case "lwin": return 0x5B;
                case "capslock": return 0x14;

                // F-Keys
                case "f1": return 0x70; case "f2": return 0x71; case "f3": return 0x72;
                case "f4": return 0x73; case "f5": return 0x74; case "f6": return 0x75;
                case "f7": return 0x76; case "f8": return 0x77; case "f9": return 0x78;
                case "f10": return 0x79; case "f11": return 0x7A; case "f12": return 0x7B;

                // Volume
                case "volup": return 0xAF;
                case "voldown": return 0xAE;
                case "volmute": return 0xAD;

                default:
                    if (k.Length == 1) {
                        short vkScan = VkKeyScan(k[0]);
                        if (vkScan != -1) return (ushort)(vkScan & 0xFF);
                    }
                    return 0;
            }
        }

        static void SendHardwareMouseMove(int x, int y) {
            int screenW = GetSystemMetrics(0);
            int screenH = GetSystemMetrics(1);
            int normX = (int)Math.Round((double)x * 65535.0 / Math.Max(1, screenW - 1));
            int normY = (int)Math.Round((double)y * 65535.0 / Math.Max(1, screenH - 1));

            SetCursorPos(x, y);

            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_MOUSE;
            inputs[0].u.mi.dx = normX;
            inputs[0].u.mi.dy = normY;
            inputs[0].u.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
            inputs[0].u.mi.time = 0;
            inputs[0].u.mi.dwExtraInfo = IntPtr.Zero;

            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        static void SendHardwareMouseClick(int x, int y, string button = "left") {
            SendHardwareMouseMove(x, y);

            POINT pt = new POINT { X = x, Y = y };
            IntPtr hwnd = WindowFromPoint(pt);
            if (hwnd != IntPtr.Zero && hwnd != GetForegroundWindow()) {
                SetForegroundWindow(hwnd);
            }

            int screenW = GetSystemMetrics(0);
            int screenH = GetSystemMetrics(1);
            int normX = (int)Math.Round((double)x * 65535.0 / Math.Max(1, screenW - 1));
            int normY = (int)Math.Round((double)y * 65535.0 / Math.Max(1, screenH - 1));

            uint downFlag = button == "right" ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
            uint upFlag = button == "right" ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;

            INPUT[] down = new INPUT[1];
            down[0].type = INPUT_MOUSE;
            down[0].u.mi.dx = normX;
            down[0].u.mi.dy = normY;
            down[0].u.mi.dwFlags = downFlag | MOUSEEVENTF_ABSOLUTE;
            SendInput(1, down, Marshal.SizeOf(typeof(INPUT)));

            Thread.Sleep(30); // 30ms hold ensures frame loop captures the click

            INPUT[] up = new INPUT[1];
            up[0].type = INPUT_MOUSE;
            up[0].u.mi.dx = normX;
            up[0].u.mi.dy = normY;
            up[0].u.mi.dwFlags = upFlag | MOUSEEVENTF_ABSOLUTE;
            SendInput(1, up, Marshal.SizeOf(typeof(INPUT)));
        }

        static void SendHardwareMouseDown(int x, int y, string button = "left") {
            SendHardwareMouseMove(x, y);

            POINT pt = new POINT { X = x, Y = y };
            IntPtr hwnd = WindowFromPoint(pt);
            if (hwnd != IntPtr.Zero && hwnd != GetForegroundWindow()) {
                SetForegroundWindow(hwnd);
            }

            int screenW = GetSystemMetrics(0);
            int screenH = GetSystemMetrics(1);
            int normX = (int)Math.Round((double)x * 65535.0 / Math.Max(1, screenW - 1));
            int normY = (int)Math.Round((double)y * 65535.0 / Math.Max(1, screenH - 1));

            uint downFlag = button == "right" ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
            INPUT[] down = new INPUT[1];
            down[0].type = INPUT_MOUSE;
            down[0].u.mi.dx = normX;
            down[0].u.mi.dy = normY;
            down[0].u.mi.dwFlags = downFlag | MOUSEEVENTF_ABSOLUTE;
            SendInput(1, down, Marshal.SizeOf(typeof(INPUT)));
        }

        static void SendHardwareMouseUp(int x, int y, string button = "left") {
            int screenW = GetSystemMetrics(0);
            int screenH = GetSystemMetrics(1);
            int normX = (int)Math.Round((double)x * 65535.0 / Math.Max(1, screenW - 1));
            int normY = (int)Math.Round((double)y * 65535.0 / Math.Max(1, screenH - 1));

            uint upFlag = button == "right" ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
            INPUT[] up = new INPUT[1];
            up[0].type = INPUT_MOUSE;
            up[0].u.mi.dx = normX;
            up[0].u.mi.dy = normY;
            up[0].u.mi.dwFlags = upFlag | MOUSEEVENTF_ABSOLUTE;
            SendInput(1, up, Marshal.SizeOf(typeof(INPUT)));
        }

        static void SendHardwareMouseScroll(int delta) {
            INPUT[] scroll = new INPUT[1];
            scroll[0].type = INPUT_MOUSE;
            scroll[0].u.mi.mouseData = (uint)delta;
            scroll[0].u.mi.dwFlags = MOUSEEVENTF_WHEEL;
            SendInput(1, scroll, Marshal.SizeOf(typeof(INPUT)));
        }

        static ImageCodecInfo GetEncoder(ImageFormat format) {
            ImageCodecInfo[] codecs = ImageCodecInfo.GetImageDecoders();
            foreach (ImageCodecInfo codec in codecs) {
                if (codec.FormatID == format.Guid) {
                    return codec;
                }
            }
            return null;
        }

        static void CaptureScreen(int targetWidth = 960, long quality = 50L) {
            try {
                Rectangle bounds = Screen.PrimaryScreen.Bounds;
                int targetHeight = (int)Math.Round((double)bounds.Height * targetWidth / bounds.Width);

                using (Bitmap fullBmp = new Bitmap(bounds.Width, bounds.Height)) {
                    using (Graphics gFull = Graphics.FromImage(fullBmp)) {
                        gFull.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                    }

                    using (Bitmap thumb = new Bitmap(targetWidth, targetHeight)) {
                        using (Graphics gThumb = Graphics.FromImage(thumb)) {
                            gThumb.InterpolationMode = InterpolationMode.Bilinear;
                            gThumb.DrawImage(fullBmp, 0, 0, targetWidth, targetHeight);
                        }

                        using (MemoryStream ms = new MemoryStream()) {
                            ImageCodecInfo encoder = GetEncoder(ImageFormat.Jpeg);
                            EncoderParameters encParams = new EncoderParameters(1);
                            encParams.Param[0] = new EncoderParameter(Encoder.Quality, quality);
                            thumb.Save(ms, encoder, encParams);
                            byte[] bytes = ms.ToArray();
                            Console.Write("data:image/jpeg;base64," + Convert.ToBase64String(bytes));
                        }
                    }
                }
            } catch (Exception ex) {
                Console.Error.WriteLine("Capture error: " + ex.Message);
            }
        }

        public static void ExecuteCommand(string[] args) {
            if (args == null || args.Length == 0) return;
            string cmd = args[0].ToLower();

            if (cmd == "capture" || cmd == "screenshot") {
                int width = 960;
                long qual = 50L;
                if (args.Length >= 2) int.TryParse(args[1], out width);
                if (args.Length >= 3) long.TryParse(args[2], out qual);
                CaptureScreen(width, qual);
                return;
            }

            // Mouse Actions
            if (cmd == "click" || cmd == "dclick" || cmd == "rclick" || cmd == "move" ||
                cmd == "down" || cmd == "up" || cmd == "rdown" || cmd == "rup") {
                if (args.Length >= 3) {
                    int x = int.Parse(args[1]);
                    int y = int.Parse(args[2]);

                    if (cmd == "click") {
                        SendHardwareMouseClick(x, y, "left");
                    } else if (cmd == "dclick") {
                        SendHardwareMouseClick(x, y, "left");
                        Thread.Sleep(45);
                        SendHardwareMouseClick(x, y, "left");
                    } else if (cmd == "rclick") {
                        SendHardwareMouseClick(x, y, "right");
                    } else if (cmd == "move") {
                        SendHardwareMouseMove(x, y);
                    } else if (cmd == "down") {
                        SendHardwareMouseDown(x, y, "left");
                    } else if (cmd == "up") {
                        SendHardwareMouseUp(x, y, "left");
                    } else if (cmd == "rdown") {
                        SendHardwareMouseDown(x, y, "right");
                    } else if (cmd == "rup") {
                        SendHardwareMouseUp(x, y, "right");
                    }
                }
                return;
            }

            if (cmd == "scroll" && args.Length >= 2) {
                int delta = int.Parse(args[1]);
                SendHardwareMouseScroll(delta);
                return;
            }

            // Continuous Key Hold & Release for Gaming (WASD, Sprint, Jump, Drive)
            if (cmd == "keydown" && args.Length >= 2) {
                ushort vk = ResolveVirtualKey(args[1]);
                if (vk != 0) SendHardwareKeyDown(vk);
                return;
            }

            if (cmd == "keyup" && args.Length >= 2) {
                ushort vk = ResolveVirtualKey(args[1]);
                if (vk != 0) SendHardwareKeyUp(vk);
                return;
            }

            // Shortcut Combos
            if (cmd == "alttab") { SendHardwareKeyCombo(0x12, 0x09); return; }
            if (cmd == "altf4") { SendHardwareKeyCombo(0x12, 0x73); return; }
            if (cmd == "taskmgr") { SendHardwareKeyCombo(0x11, 0x10, 0x1B); return; }
            if (cmd == "wind") { SendHardwareKeyCombo(0x5B, 0x44); return; }
            if (cmd == "wine") { SendHardwareKeyCombo(0x5B, 0x45); return; }
            if (cmd == "winr") { SendHardwareKeyCombo(0x5B, 0x52); return; }
            if (cmd == "ctrlc") { SendHardwareKeyCombo(0x11, 0x43); return; }
            if (cmd == "ctrlv") { SendHardwareKeyCombo(0x11, 0x56); return; }
            if (cmd == "ctrla") { SendHardwareKeyCombo(0x11, 0x41); return; }
            if (cmd == "ctrlz") { SendHardwareKeyCombo(0x11, 0x5A); return; }
            if (cmd == "ctrlx") { SendHardwareKeyCombo(0x11, 0x58); return; }
            if (cmd == "ctrlw") { SendHardwareKeyCombo(0x11, 0x57); return; }
            if (cmd == "ctrlt") { SendHardwareKeyCombo(0x11, 0x54); return; }

            // Key Parameter Tap (Hardware Scan Code)
            if (cmd == "key" && args.Length >= 2) {
                string k = args[1].ToLower();
                if (k == "alttab" || k == "%{tab}") { SendHardwareKeyCombo(0x12, 0x09); return; }
                if (k == "altf4" || k == "%{f4}") { SendHardwareKeyCombo(0x12, 0x73); return; }
                if (k == "taskmgr" || k == "^+{esc}") { SendHardwareKeyCombo(0x11, 0x10, 0x1B); return; }
                if (k == "wind" || k == "#d") { SendHardwareKeyCombo(0x5B, 0x44); return; }
                if (k == "wine" || k == "#e") { SendHardwareKeyCombo(0x5B, 0x45); return; }
                if (k == "winr" || k == "#r") { SendHardwareKeyCombo(0x5B, 0x52); return; }
                if (k == "ctrlc" || k == "^c") { SendHardwareKeyCombo(0x11, 0x43); return; }
                if (k == "ctrlv" || k == "^v") { SendHardwareKeyCombo(0x11, 0x56); return; }
                if (k == "ctrla" || k == "^a") { SendHardwareKeyCombo(0x11, 0x41); return; }
                if (k == "ctrlz" || k == "^z") { SendHardwareKeyCombo(0x11, 0x5A); return; }

                ushort vk = ResolveVirtualKey(k);
                if (vk != 0) {
                    SendHardwareKeyTap(vk);
                    return;
                }

                // Fallback
                try { SendKeys.SendWait(args[1]); } catch {}
                return;
            }

            // Direct Characters & Text
            if (cmd == "text" && args.Length >= 2) {
                string text = string.Join(" ", args, 1, args.Length - 1);
                foreach (char ch in text) {
                    short res = VkKeyScan(ch);
                    if (res != -1) {
                        byte vk = (byte)(res & 0xFF);
                        byte shift = (byte)((res >> 8) & 0xFF);
                        bool needShift = (shift & 1) != 0;

                        if (needShift) SendHardwareKeyDown(0x10);
                        SendHardwareKeyTap(vk);
                        if (needShift) SendHardwareKeyUp(0x10);
                    } else {
                        try { SendKeys.SendWait(ch.ToString()); } catch {}
                    }
                    Thread.Sleep(5);
                }
                return;
            }

            // Direct Key Name fallback
            ushort fallbackVk = ResolveVirtualKey(cmd);
            if (fallbackVk != 0) {
                SendHardwareKeyTap(fallbackVk);
            }
        }

        [STAThread]
        static void Main(string[] args) {
            if (args.Length == 0) return;

            // Persistent Worker / Daemon Mode for Microsecond Latency
            if (args[0].ToLower() == "worker" || args[0].ToLower() == "daemon") {
                string line;
                while ((line = Console.ReadLine()) != null) {
                    line = line.Trim();
                    if (line.Length == 0) continue;
                    if (line.ToLower() == "exit" || line.ToLower() == "quit") break;
                    try {
                        string[] parts = line.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        ExecuteCommand(parts);
                        Console.WriteLine("OK");
                    } catch (Exception ex) {
                        Console.WriteLine("ERR " + ex.Message);
                    }
                    Console.Out.Flush();
                }
                return;
            }

            try {
                ExecuteCommand(args);
            } catch (Exception ex) {
                Console.Error.WriteLine(ex.Message);
            }
        }
    }
}

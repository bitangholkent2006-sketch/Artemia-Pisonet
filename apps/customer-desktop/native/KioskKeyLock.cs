using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace ArtemiaPisonet
{
    public class KioskKeyLock
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WH_MOUSE_LL = 14;

        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        private const int LLKHF_INJECTED = 0x10;
        private const int LLMHF_INJECTED = 0x01;

        private static LowLevelProc _kbProc = KbHookCallback;
        private static LowLevelProc _mouseProc = MouseHookCallback;
        private static IntPtr _kbHook = IntPtr.Zero;
        private static IntPtr _mouseHook = IntPtr.Zero;
        private static int _parentPid = 0;

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT
        {
            public int vkCode;
            public int scanCode;
            public int flags;
            public int time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int x;
            public int y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MSLLHOOKSTRUCT
        {
            public POINT pt;
            public uint mouseData;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        public static void Main(string[] args)
        {
            if (args != null && args.Length > 0)
            {
                int.TryParse(args[0], out _parentPid);
            }

            _kbHook = SetHook(WH_KEYBOARD_LL, _kbProc);
            _mouseHook = SetHook(WH_MOUSE_LL, _mouseProc);

            System.Windows.Forms.Timer watchdog = null;
            if (_parentPid > 0)
            {
                watchdog = new System.Windows.Forms.Timer();
                watchdog.Interval = 500;
                watchdog.Tick += (s, e) =>
                {
                    try
                    {
                        Process p = Process.GetProcessById(_parentPid);
                        if (p == null || p.HasExited)
                        {
                            Application.ExitThread();
                        }
                    }
                    catch
                    {
                        Application.ExitThread();
                    }
                };
                watchdog.Start();
            }

            Application.Run();

            if (watchdog != null) watchdog.Stop();
            if (_kbHook != IntPtr.Zero) UnhookWindowsHookEx(_kbHook);
            if (_mouseHook != IntPtr.Zero) UnhookWindowsHookEx(_mouseHook);
        }

        private static IntPtr SetHook(int hookType, LowLevelProc proc)
        {
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule)
            {
                return SetWindowsHookEx(hookType, proc, GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        private delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

        private static IntPtr KbHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int msg = wParam.ToInt32();
                if (msg == WM_KEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYDOWN || msg == WM_SYSKEYUP)
                {
                    KBDLLHOOKSTRUCT hookStruct = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                    // Allow remote admin injected input, block ALL physical keyboard presses while locked
                    if ((hookStruct.flags & LLKHF_INJECTED) == 0)
                    {
                        return (IntPtr)1;
                    }
                }
            }
            return CallNextHookEx(_kbHook, nCode, wParam, lParam);
        }

        private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                MSLLHOOKSTRUCT hookStruct = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
                // Allow remote admin injected mouse events, block ALL physical mouse movement/clicks/wheel while locked
                if ((hookStruct.flags & LLMHF_INJECTED) == 0)
                {
                    return (IntPtr)1;
                }
            }
            return CallNextHookEx(_mouseHook, nCode, wParam, lParam);
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);
    }
}

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("AniMessenger")]
[assembly: AssemblyProduct("AniMessenger")]
[assembly: AssemblyCompany("KatamariKei")]

namespace AniMessengerTray
{
    internal static class Program
    {
        private const string MutexName = "Local\\AniMessenger.Tray";

        [STAThread]
        private static void Main(string[] args)
        {
            bool openBrowser = !Array.Exists(args, delegate(string arg) { return String.Equals(arg, "--background", StringComparison.OrdinalIgnoreCase); });
            bool created;
            using (var mutex = new Mutex(true, MutexName, out created))
            {
                if (!created)
                {
                    TrayContext.RunLauncher(openBrowser);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayContext(openBrowser));
            }
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private const string ReleasesUrl = "https://github.com/KatamariKei/AniMessenger/releases/latest";
        private readonly NotifyIcon trayIcon;
        private readonly ToolStripMenuItem statusItem;
        private readonly ToolStripMenuItem startItem;
        private readonly ToolStripMenuItem stopItem;
        private readonly System.Windows.Forms.Timer statusTimer;
        private readonly string trayPidFile;

        internal TrayContext(bool openBrowser)
        {
            string runtimeDirectory = Path.Combine(GetPrivateHome(), "runtime");
            Directory.CreateDirectory(runtimeDirectory);
            trayPidFile = Path.Combine(runtimeDirectory, "tray.pid");
            File.WriteAllText(trayPidFile, Process.GetCurrentProcess().Id.ToString());

            statusItem = new ToolStripMenuItem("Service status") { Enabled = false };
            var openItem = new ToolStripMenuItem("Open AniMessenger", null, delegate { RunLauncher(true); });
            openItem.Font = new Font(openItem.Font, FontStyle.Bold);
            startItem = new ToolStripMenuItem("Start service", null, delegate { StartService(); });
            stopItem = new ToolStripMenuItem("Stop service", null, delegate
            {
                if (StopService(false)) ShowStatus("AniMessenger stopped", "Your chats are safe. Use this tray icon to start the service again.");
            });
            var updateItem = new ToolStripMenuItem("Check for updates…", null, delegate { OpenUrl(ReleasesUrl); });
            var quitItem = new ToolStripMenuItem("Quit AniMessenger", null, delegate { QuitAniMessenger(); });

            var menu = new ContextMenuStrip();
            menu.Items.Add(statusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(openItem);
            menu.Items.Add(startItem);
            menu.Items.Add(stopItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(updateItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(quitItem);
            menu.Opening += delegate { RefreshStatus(); };

            Icon icon;
            try { icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { icon = SystemIcons.Application; }
            trayIcon = new NotifyIcon
            {
                Icon = icon,
                Text = "AniMessenger",
                ContextMenuStrip = menu,
                Visible = true
            };
            trayIcon.DoubleClick += delegate { RunLauncher(true); };

            statusTimer = new System.Windows.Forms.Timer { Interval = 3000 };
            statusTimer.Tick += delegate { RefreshStatus(); };
            statusTimer.Start();
            RefreshStatus();
            RunLauncher(openBrowser);
        }

        private static string GetInstallRoot()
        {
            return Path.GetDirectoryName(Application.ExecutablePath);
        }

        private static string GetPrivateHome()
        {
            string configured = Environment.GetEnvironmentVariable("ANIMESSENGER_HOME");
            if (!String.IsNullOrWhiteSpace(configured)) return Path.GetFullPath(configured);
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(local, "AniMessenger");
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        internal static void RunLauncher(bool openBrowser)
        {
            string root = GetInstallRoot();
            string node = Path.Combine(root, "runtime", "node.exe");
            string launcher = Path.Combine(root, "scripts", "launch.mjs");
            if (!File.Exists(node) || !File.Exists(launcher))
            {
                MessageBox.Show("AniMessenger's application files are incomplete. Run the installer again to repair them.", "AniMessenger", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try
            {
                var info = new ProcessStartInfo
                {
                    FileName = node,
                    Arguments = Quote(launcher) + (openBrowser ? "" : " --no-open"),
                    WorkingDirectory = root,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(info);
            }
            catch (Exception error)
            {
                MessageBox.Show("AniMessenger could not start. " + error.Message, "AniMessenger", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static int ReadServerPid()
        {
            string file = Path.Combine(GetPrivateHome(), "runtime", "server.pid");
            if (!File.Exists(file)) return 0;
            int pid;
            return Int32.TryParse(File.ReadAllText(file).Trim(), out pid) ? pid : 0;
        }

        private static bool ServerIsRunning()
        {
            int pid = ReadServerPid();
            if (pid <= 0) return false;
            try
            {
                using (var process = Process.GetProcessById(pid))
                {
                    return !process.HasExited && PathsMatch(process.MainModule.FileName, Path.Combine(GetInstallRoot(), "runtime", "node.exe"));
                }
            }
            catch { return false; }
        }

        private static bool PathsMatch(string left, string right)
        {
            try
            {
                return String.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        private void RefreshStatus()
        {
            bool running = ServerIsRunning();
            statusItem.Text = running ? "Service: Running" : "Service: Stopped";
            startItem.Enabled = !running;
            stopItem.Enabled = running;
            trayIcon.Text = running ? "AniMessenger — Running" : "AniMessenger — Stopped";
        }

        private void StartService()
        {
            RunLauncher(false);
            var refresh = new System.Windows.Forms.Timer { Interval = 1200 };
            refresh.Tick += delegate
            {
                refresh.Stop();
                refresh.Dispose();
                RefreshStatus();
                if (ServerIsRunning()) ShowStatus("AniMessenger is running", "Double-click the tray icon whenever you want to open it.");
                else ShowStatus("AniMessenger could not start", "Open AniMessenger again or check the local logs for details.");
            };
            refresh.Start();
        }

        private bool StopService(bool quiet)
        {
            int pid = ReadServerPid();
            string pidFile = Path.Combine(GetPrivateHome(), "runtime", "server.pid");
            if (pid <= 0)
            {
                TryDelete(pidFile);
                RefreshStatus();
                return true;
            }

            try
            {
                using (var process = Process.GetProcessById(pid))
                {
                    string expected = Path.Combine(GetInstallRoot(), "runtime", "node.exe");
                    if (!PathsMatch(process.MainModule.FileName, expected))
                        throw new InvalidOperationException("The saved service ID belongs to a different program, so AniMessenger left it untouched.");
                    process.Kill();
                    process.WaitForExit(5000);
                }
                TryDelete(pidFile);
                RefreshStatus();
                return true;
            }
            catch (ArgumentException)
            {
                TryDelete(pidFile);
                RefreshStatus();
                return true;
            }
            catch (Exception error)
            {
                if (!quiet) MessageBox.Show(error.Message, "AniMessenger", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
        }

        private static void OpenUrl(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch (Exception error) { MessageBox.Show("Windows could not open the link. " + error.Message, "AniMessenger", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }

        private void ShowStatus(string title, string message)
        {
            trayIcon.BalloonTipTitle = title;
            trayIcon.BalloonTipText = message;
            trayIcon.BalloonTipIcon = ToolTipIcon.Info;
            trayIcon.ShowBalloonTip(3500);
        }

        private void QuitAniMessenger()
        {
            if (!StopService(false)) return;
            ExitThread();
        }

        private static void TryDelete(string file)
        {
            try { if (File.Exists(file)) File.Delete(file); }
            catch { }
        }

        protected override void ExitThreadCore()
        {
            statusTimer.Stop();
            statusTimer.Dispose();
            trayIcon.Visible = false;
            trayIcon.Dispose();
            try
            {
                if (File.Exists(trayPidFile) && File.ReadAllText(trayPidFile).Trim() == Process.GetCurrentProcess().Id.ToString())
                    File.Delete(trayPidFile);
            }
            catch { }
            base.ExitThreadCore();
        }
    }
}

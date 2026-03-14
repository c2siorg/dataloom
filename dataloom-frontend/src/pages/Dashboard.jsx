import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getRecentProjects } from "../api";
import {
    FolderOpen,
    Plus,
    TrendingUp,
    Database,
    Clock,
    ArrowRight,
    Layers,
} from "lucide-react";

/**
 * Modern dashboard overview with stats, recent projects, and quick actions.
 */
export default function Dashboard() {
    const [recentProjects, setRecentProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const projects = await getRecentProjects();
            setRecentProjects(projects);
        } catch (err) {
            console.error("Error fetching dashboard data:", err);
        } finally {
            setLoading(false);
        }
    };

    const stats = [
        {
            label: "Total Datasets",
            value: recentProjects.length,
            icon: Database,
            color: "from-brand-500 to-brand-600",
            bg: "bg-brand-500/10",
            text: "text-brand-400",
        },
        {
            label: "Recent Transforms",
            value: "—",
            icon: Layers,
            color: "from-cyan-500 to-cyan-600",
            bg: "bg-cyan-500/10",
            text: "text-cyan-400",
        },
        {
            label: "Active Projects",
            value: recentProjects.filter((p) => {
                const d = new Date(p.last_modified);
                return Date.now() - d.getTime() < 7 * 86400000;
            }).length,
            icon: TrendingUp,
            color: "from-emerald-500 to-emerald-600",
            bg: "bg-emerald-500/10",
            text: "text-emerald-400",
        },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
            {/* Welcome Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600/20 via-surface-900 to-cyan-600/10 border border-surface-700/40 p-8">
                <div className="absolute inset-0 bg-hero-pattern pointer-events-none" />
                <div className="relative">
                    <h1 className="text-3xl font-bold text-white mb-2">
                        Welcome to{" "}
                        <span className="text-gradient">DataLoom</span>
                    </h1>
                    <p className="text-surface-400 text-lg max-w-xl">
                        Your intelligent platform for dataset exploration, transformation,
                        and visualization. Start by uploading a dataset or exploring an
                        existing project.
                    </p>
                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={() => navigate("/projects")}
                            className="btn-primary flex items-center gap-2"
                            id="dashboard-new-project"
                        >
                            <Plus className="w-4 h-4" />
                            New Project
                        </button>
                        <button
                            onClick={() => navigate("/projects")}
                            className="btn-secondary flex items-center gap-2"
                            id="dashboard-browse-projects"
                        >
                            <FolderOpen className="w-4 h-4" />
                            Browse Projects
                        </button>
                    </div>
                </div>

                {/* Floating decorative elements */}
                <div className="absolute -right-8 -top-8 w-48 h-48 bg-brand-500/10 rounded-full blur-3xl animate-float" />
                <div className="absolute -right-4 -bottom-12 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl animate-float" />
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className="glass-card p-5 flex items-center gap-4 animate-fade-in-up"
                    >
                        <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                            <stat.icon className={`w-6 h-6 ${stat.text}`} />
                        </div>
                        <div>
                            <p className="text-sm text-surface-400">{stat.label}</p>
                            <p className="text-2xl font-bold text-white">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent Projects */}
            <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            Recent Projects
                        </h2>
                        <p className="text-sm text-surface-400 mt-0.5">
                            Your recently modified datasets
                        </p>
                    </div>
                    <button
                        onClick={() => navigate("/projects")}
                        className="btn-ghost flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300"
                    >
                        View all <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-16 shimmer rounded-xl" />
                        ))}
                    </div>
                ) : recentProjects.length === 0 ? (
                    <div className="text-center py-12">
                        <Database className="w-12 h-12 text-surface-600 mx-auto mb-3" />
                        <p className="text-surface-400">No projects yet</p>
                        <p className="text-surface-500 text-sm mt-1">
                            Upload a CSV to get started
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {recentProjects.slice(0, 5).map((project) => (
                            <button
                                key={project.project_id}
                                onClick={() => navigate(`/workspace/${project.project_id}`)}
                                className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-800/40 hover:bg-surface-800/70 border border-transparent hover:border-surface-700/60 transition-all duration-200 group animate-fade-in-up"
                                id={`dashboard-project-${project.project_id}`}
                            >
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                                    <Database className="w-5 h-5 text-brand-400" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <p className="text-sm font-medium text-surface-200 truncate group-hover:text-white transition-colors">
                                        {project.name}
                                    </p>
                                    {project.description && (
                                        <p className="text-xs text-surface-500 truncate mt-0.5">
                                            {project.description}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <Clock className="w-3.5 h-3.5 text-surface-500" />
                                    <span className="text-xs text-surface-500">
                                        {new Date(project.last_modified).toLocaleDateString(
                                            undefined,
                                            { month: "short", day: "numeric" }
                                        )}
                                    </span>
                                </div>
                                <ArrowRight className="w-4 h-4 text-surface-600 group-hover:text-brand-400 transition-colors" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    {
                        title: "Upload Dataset",
                        desc: "Import CSV files",
                        icon: "📊",
                        action: () => navigate("/projects"),
                    },
                    {
                        title: "Transform Data",
                        desc: "Filter, sort, pivot",
                        icon: "🔄",
                        action: () => navigate("/projects"),
                    },
                    {
                        title: "Visualize",
                        desc: "Charts & graphs",
                        icon: "📈",
                        action: () => navigate("/projects"),
                    },
                    {
                        title: "Export",
                        desc: "Download results",
                        icon: "💾",
                        action: () => navigate("/projects"),
                    },
                ].map((item) => (
                    <button
                        key={item.title}
                        onClick={item.action}
                        className="glass-card-hover p-5 text-left group"
                        id={`quick-action-${item.title.toLowerCase().replace(/\s/g, '-')}`}
                    >
                        <span className="text-2xl">{item.icon}</span>
                        <h3 className="text-sm font-semibold text-surface-200 mt-3 group-hover:text-white transition-colors">
                            {item.title}
                        </h3>
                        <p className="text-xs text-surface-500 mt-1">{item.desc}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}

import { useState } from "react";
import {
    User,
    Mail,
    Globe,
    Bell,
    Shield,
    Palette,
    Save,
} from "lucide-react";

/**
 * User profile and settings page.
 */
export default function ProfilePage() {
    const [profile, setProfile] = useState({
        name: "DataLoom User",
        email: "user@dataloom.dev",
        bio: "Data scientist and analyst",
        timezone: "UTC+5:30",
    });
    const [notifications, setNotifications] = useState(true);

    const handleChange = (field, value) => {
        setProfile((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-white">Profile & Settings</h1>
                <p className="text-surface-400 text-sm mt-1">
                    Manage your account and preferences
                </p>
            </div>

            {/* Profile Header */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-5">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center shadow-glow">
                        <User className="w-10 h-10 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-white">
                            {profile.name}
                        </h2>
                        <p className="text-surface-400 text-sm">{profile.email}</p>
                        <p className="text-surface-500 text-xs mt-1">{profile.bio}</p>
                    </div>
                </div>
            </div>

            {/* Personal Information */}
            <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Personal Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Full Name
                        </label>
                        <input
                            type="text"
                            value={profile.name}
                            onChange={(e) => handleChange("name", e.target.value)}
                            className="input-field"
                            id="profile-name"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Email
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                            <input
                                type="email"
                                value={profile.email}
                                onChange={(e) => handleChange("email", e.target.value)}
                                className="input-field pl-10"
                                id="profile-email"
                            />
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Bio
                        </label>
                        <textarea
                            value={profile.bio}
                            onChange={(e) => handleChange("bio", e.target.value)}
                            rows={3}
                            className="input-field resize-none"
                            id="profile-bio"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                            Timezone
                        </label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                            <input
                                type="text"
                                value={profile.timezone}
                                onChange={(e) => handleChange("timezone", e.target.value)}
                                className="input-field pl-10"
                                id="profile-timezone"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Preferences */}
            <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Preferences
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/40 border border-surface-700/30">
                        <div className="flex items-center gap-3">
                            <Bell className="w-5 h-5 text-surface-400" />
                            <div>
                                <p className="text-sm font-medium text-surface-200">
                                    Notifications
                                </p>
                                <p className="text-xs text-surface-500">
                                    Receive activity notifications
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setNotifications(!notifications)}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${notifications ? "bg-brand-500" : "bg-surface-600"
                                }`}
                            id="profile-notifications-toggle"
                        >
                            <div
                                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${notifications ? "translate-x-[22px]" : "translate-x-[2px]"
                                    }`}
                            />
                        </button>
                    </div>
                </div>
            </div>

            {/* Security */}
            <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Security
                </h3>
                <button className="btn-secondary text-sm">
                    Change Password
                </button>
            </div>

            {/* Save */}
            <div className="flex justify-end">
                <button
                    className="btn-primary flex items-center gap-2"
                    id="profile-save-btn"
                >
                    <Save className="w-4 h-4" />
                    Save Changes
                </button>
            </div>
        </div>
    );
}

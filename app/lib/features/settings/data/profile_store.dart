import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../domain/pc_profile.dart';

class ProfileStore {
  static const _key = 'pc_profile_v1';
  final SharedPreferences _prefs;
  ProfileStore(this._prefs);

  PcProfile load() {
    final raw = _prefs.getString(_key);
    if (raw == null) return const PcProfile();
    try {
      return PcProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return const PcProfile();
    }
  }

  Future<void> save(PcProfile p) => _prefs.setString(_key, jsonEncode(p.toJson()));
}

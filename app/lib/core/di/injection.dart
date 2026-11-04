import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../features/assistant/chat_cubit.dart';
import '../../features/files/files_service.dart';
import '../../features/power/data/agent_client.dart';
import '../../features/power/data/plug_client.dart';
import '../../features/power/data/wol_service.dart';
import '../../features/power/presentation/power_cubit.dart';
import '../../features/settings/data/profile_store.dart';

final sl = GetIt.instance;

Future<void> setupDi() async {
  final prefs = await SharedPreferences.getInstance();
  sl
    ..registerSingleton(ProfileStore(prefs))
    ..registerSingleton(AgentClient())
    ..registerLazySingleton(WolService.new)
    ..registerLazySingleton(PlugClient.new)
    ..registerLazySingleton(() => FilesService(sl()))
    ..registerLazySingleton(() => ChatCubit(sl()))
    ..registerLazySingleton(() => PowerCubit(sl(), sl(), sl(), sl()));
}

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'core/di/injection.dart';
import 'core/shell/home_shell.dart';
import 'core/theme/app_theme.dart';
import 'features/power/presentation/power_cubit.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await setupDi();
  runApp(const PcRemoteApp());
}

class PcRemoteApp extends StatelessWidget {
  const PcRemoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: sl<PowerCubit>(),
      child: MaterialApp(
        title: 'PC Remote',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.system, // alterna sozinho com o sistema
        home: const HomeShell(),
      ),
    );
  }
}
